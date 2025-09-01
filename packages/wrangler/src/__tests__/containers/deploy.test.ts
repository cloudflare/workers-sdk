import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import { PassThrough, Writable } from "node:stream";
import {
	getCloudflareContainerRegistry,
	InstanceType,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import { http, HttpResponse } from "msw";
import { clearCachedAccount } from "../../cloudchamber/locations";
import { mockAccountV4 as mockContainersAccount } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockCLIOutput, mockConsoleMethods } from "../helpers/mock-console";
import { mockLegacyScriptData } from "../helpers/mock-legacy-script";
import { mockUploadWorkerRequest } from "../helpers/mock-upload-worker";
import { mockSubDomainRequest } from "../helpers/mock-workers-subdomain";
import {
	createFetchResult,
	msw,
	mswSuccessDeploymentScriptMetadata,
} from "../helpers/msw";
import { mswListNewDeploymentsLatestFull } from "../helpers/msw/handlers/versions";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import { writeWranglerConfig } from "../helpers/write-wrangler-config";
import type {
	AccountRegistryToken,
	Application,
	CreateApplicationRequest,
	ImageRegistryCredentialsConfiguration,
} from "@cloudflare/containers-shared";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process");

describe("wrangler deploy with containers", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const cliStd = mockCLIOutput();
	mockAccountId();
	mockApiToken();
	beforeEach(() => {
		setupCommonMocks();
		fs.writeFileSync(
			"index.js",
			`export class ExampleDurableObject {}; export default{};`
		);
		vi.stubEnv("WRANGLER_DOCKER_BIN", "/usr/bin/docker");
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});
	it("should fail early if no docker is detected when deploying a container from a dockerfile", async () => {
		vi.stubEnv("WRANGLER_DOCKER_BIN", "/usr/bin/bad-docker-path");
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [DEFAULT_CONTAINER_FROM_DOCKERFILE],
		});

		fs.writeFileSync("./Dockerfile", "FROM scratch");

		await expect(
			runWrangler("deploy index.js")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`
			[Error: The Docker CLI could not be launched. Please ensure that the Docker CLI is installed and the daemon is running.
			Other container tooling that is compatible with the Docker CLI and engine may work, but is not yet guaranteed to do so. You can specify an executable with the environment variable WRANGLER_DOCKER_BIN and a socket with DOCKER_HOST.]
		`
		);
	});
	it("should be able to deploy a new container from a dockerfile", async () => {
		mockGetVersion("Galaxy-Class");
		setupDockerMocks("my-container", "Galaxy");
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [DEFAULT_CONTAINER_FROM_DOCKERFILE],
		});
		mockGetApplications([]);
		fs.writeFileSync("./Dockerfile", "FROM scratch");
		mockGenerateImageRegistryCredentials();

		mockCreateApplication({
			name: "my-container",
			max_instances: 10,
			configuration: {
				image:
					getCloudflareContainerRegistry() +
					"/some-account-id/my-container:Galaxy",
			},
		});

		await runWrangler("deploy index.js");

		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding                                            Resource
			env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

			Uploaded test-name (TIMINGS)
			Building image my-container:Galaxy
			Image does not exist remotely, pushing: registry.cloudflare.com/some-account-id/my-container:Galaxy
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ NEW my-container
			│
			│   [[containers]]
			│   name = \\"my-container\\"
			│   scheduling_policy = \\"default\\"
			│   instances = 0
			│   max_instances = 10
			│   rollout_active_grace_period = 0
			│
			│     [containers.configuration]
			│     image = \\"registry.cloudflare.com/some-account-id/my-container:Galaxy\\"
			│     instance_type = \\"dev\\"
			│
			│     [containers.constraints]
			│     tier = 1
			│
			│     [containers.durable_objects]
			│     namespace_id = \\"1\\"
			│
			│
			│  SUCCESS  Created application my-container (Application ID: undefined)
			│
			╰ Applied changes

			"
		`);
	});
	it("should be able to deploy a new container from an image uri", async () => {
		// note no docker commands have been mocked here!
		mockGetVersion("Galaxy-Class");
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [
				{
					...DEFAULT_CONTAINER_FROM_REGISTRY,
					rollout_active_grace_period: 600,
				},
			],
		});

		mockGetApplications([]);

		mockCreateApplication({
			name: "my-container",
			max_instances: 10,
			scheduling_policy: SchedulingPolicy.DEFAULT,
			rollout_active_grace_period: 600,
		});

		await runWrangler("deploy index.js");

		expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                            Resource
					env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ NEW my-container
			│
			│   [[containers]]
			│   name = \\"my-container\\"
			│   scheduling_policy = \\"default\\"
			│   instances = 0
			│   max_instances = 10
			│   rollout_active_grace_period = 600
			│
			│     [containers.configuration]
			│     image = \\"docker.io/hello:world\\"
			│     instance_type = \\"dev\\"
			│
			│     [containers.constraints]
			│     tier = 1
			│
			│     [containers.durable_objects]
			│     namespace_id = \\"1\\"
			│
			│
			│  SUCCESS  Created application my-container (Application ID: undefined)
			│
			╰ Applied changes

			"
		`);
	});

	it("should be able to deploy a new container with custom instance limits", async () => {
		// this test checks the deprecated path for setting custom instance limits
		// note no docker commands have been mocked here!
		mockGetVersion("Galaxy-Class");
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [
				{
					...DEFAULT_CONTAINER_FROM_REGISTRY,
					configuration: {
						vcpu: 1,
						memory_mib: 1000,
						disk: { size_mb: 2000 },
					},
				},
			],
		});

		mockGetApplications([]);

		mockCreateApplication({
			name: "my-container",
			max_instances: 10,
			scheduling_policy: SchedulingPolicy.DEFAULT,
			configuration: {
				image: "docker.io/hello:world",
				disk: {
					size_mb: 2000,
				},
				vcpu: 1,
				memory_mib: 1000,
			},
		});

		await runWrangler("deploy index.js");

		expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                            Resource
					env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
		expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mProcessing wrangler.toml configuration:[0m

			    - \\"containers.configuration\\" is deprecated. Use top level \\"containers\\" fields instead.
			  \\"configuration.image\\" should be \\"image\\", limits should be set via \\"instance_type\\".

			"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);

		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ NEW my-container
			│
			│   [[containers]]
			│   name = \\"my-container\\"
			│   scheduling_policy = \\"default\\"
			│   instances = 0
			│   max_instances = 10
			│   rollout_active_grace_period = 0
			│
			│     [containers.configuration]
			│     image = \\"docker.io/hello:world\\"
			│     memory_mib = 1_000
			│     vcpu = 1
			│
			│       [containers.configuration.disk]
			│       size_mb = 2_000
			│
			│     [containers.constraints]
			│     tier = 1
			│
			│     [containers.durable_objects]
			│     namespace_id = \\"1\\"
			│
			│
			│  SUCCESS  Created application my-container (Application ID: undefined)
			│
			╰ Applied changes

			"
		`);
	});

	it("should be able to deploy a new container with custom instance limits (instance_type)", async () => {
		// tests the preferred method for setting custom instance limits
		// note no docker commands have been mocked here!
		mockGetVersion("Galaxy-Class");
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [
				{
					...DEFAULT_CONTAINER_FROM_REGISTRY,
					instance_type: {
						vcpu: 1,
						memory_mib: 1000,
						disk_mb: 2000,
					},
				},
			],
		});

		mockGetApplications([]);

		mockCreateApplication({
			name: "my-container",
			max_instances: 10,
			scheduling_policy: SchedulingPolicy.DEFAULT,
			configuration: {
				image: "docker.io/hello:world",
				disk: {
					size_mb: 2000,
				},
				vcpu: 1,
				memory_mib: 1000,
			},
		});

		await runWrangler("deploy index.js");

		expect(std.out).toMatchInlineSnapshot(`
					"Total Upload: xx KiB / gzip: xx KiB
					Worker Startup Time: 100 ms
					Your Worker has access to the following bindings:
					Binding                                            Resource
					env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

					Uploaded test-name (TIMINGS)
					Deployed test-name triggers (TIMINGS)
					  https://test-name.test-sub-domain.workers.dev
					Current Version ID: Galaxy-Class"
				`);
		// no deprecation warnings should show up on this run
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);

		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ NEW my-container
			│
			│   [[containers]]
			│   name = \\"my-container\\"
			│   scheduling_policy = \\"default\\"
			│   instances = 0
			│   max_instances = 10
			│   rollout_active_grace_period = 0
			│
			│     [containers.configuration]
			│     image = \\"docker.io/hello:world\\"
			│     memory_mib = 1_000
			│     vcpu = 1
			│
			│       [containers.configuration.disk]
			│       size_mb = 2_000
			│
			│     [containers.constraints]
			│     tier = 1
			│
			│     [containers.durable_objects]
			│     namespace_id = \\"1\\"
			│
			│
			│  SUCCESS  Created application my-container (Application ID: undefined)
			│
			╰ Applied changes

			"
		`);
	});

	it("should resolve the docker build context path based on the dockerfile location, if image_build_context is not provided", async () => {
		vi.stubEnv("WRANGLER_DOCKER_BIN", "/usr/bin/docker");
		mockGetVersion("Galaxy-Class");
		setupDockerMocks("my-container", "Galaxy");
		mockContainersAccount();

		writeWranglerConfig(
			{
				main: "./worker/index.js",
				...DEFAULT_DURABLE_OBJECTS,
				containers: [
					{
						name: "my-container",
						max_instances: 10,
						class_name: "ExampleDurableObject",
						image: "../Dockerfile",
					},
				],
			},
			"src/wrangler.json"
		);

		fs.writeFileSync("Dockerfile", "FROM scratch");
		fs.mkdirSync("src/worker", { recursive: true });
		fs.writeFileSync(
			"src/worker/index.js",
			`export class ExampleDurableObject {}; export default{};`
		);
		mockGetApplications([]);

		mockGenerateImageRegistryCredentials();

		mockCreateApplication({
			name: "my-container",
			max_instances: 10,
			configuration: {
				image:
					getCloudflareContainerRegistry() +
					"/some-account-id/my-container:Galaxy",
			},
		});

		await runWrangler("deploy --cwd src");

		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding                                            Resource
			env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

			Uploaded test-name (TIMINGS)
			Building image my-container:Galaxy
			Image does not exist remotely, pushing: registry.cloudflare.com/some-account-id/my-container:Galaxy
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
	});

	it("should resolve dockerfile path relative to wrangler config path", async () => {
		mockGetVersion("Galaxy-Class");
		setupDockerMocks("my-container", "Galaxy", "FROM alpine");

		fs.mkdirSync("nested/src", { recursive: true });
		fs.writeFileSync("Dockerfile", "FROM alpine");
		fs.writeFileSync(
			"nested/src/index.js",
			`export class ExampleDurableObject {}; export default{};`
		);

		writeWranglerConfig(
			{
				main: "./src/index.js",
				...DEFAULT_DURABLE_OBJECTS,
				containers: [
					{
						name: "my-container",
						max_instances: 10,
						class_name: "ExampleDurableObject",
						image: "../Dockerfile",
					},
				],
			},
			"nested/wrangler.json"
		);

		mockGetApplications([]);
		mockGenerateImageRegistryCredentials();

		mockCreateApplication({
			name: "my-container",
			max_instances: 10,
			configuration: {
				image:
					getCloudflareContainerRegistry() +
					"/some-account-id/my-container:Galaxy",
			},
		});

		await runWrangler("deploy -c nested/wrangler.json");

		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding                                            Resource
			env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

			Uploaded test-name (TIMINGS)
			Building image my-container:Galaxy
			Image does not exist remotely, pushing: registry.cloudflare.com/some-account-id/my-container:Galaxy
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
	});

	it("should be able to redeploy an existing application ", async () => {
		mockGetVersion("Galaxy-Class");
		setupDockerMocks("my-container", "Galaxy");
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [
				{
					...DEFAULT_CONTAINER_FROM_DOCKERFILE,
					rollout_active_grace_period: 600,
				},
			],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container",
				instances: 0,
				max_instances: 2,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				scheduling_policy: SchedulingPolicy.DEFAULT,
				configuration: {
					image: "registry.cloudflare.com/some-account-id/my-container:old",
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
				durable_objects: {
					namespace_id: "1",
				},
				rollout_active_grace_period: 500,
			},
		]);
		fs.writeFileSync("./Dockerfile", "FROM scratch");
		mockGenerateImageRegistryCredentials();
		mockModifyApplication({
			configuration: {
				image: "registry.cloudflare.com/some-account-id/my-container:Galaxy",
			},
			max_instances: 10,
			rollout_active_grace_period: 600,
		});
		mockCreateApplicationRollout({
			description: "Progressive update",
			strategy: "rolling",
			kind: "full_auto",
		});
		await runWrangler("deploy index.js");

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container
			│
			│   [[containers]]
			│ - max_instances = 2
			│ + max_instances = 10
			│   name = \\"my-container\\"
			│ - rollout_active_grace_period = 500
			│ + rollout_active_grace_period = 600
			│   scheduling_policy = \\"default\\"
			│     [containers.configuration]
			│ -   image = \\"registry.cloudflare.com/some-account-id/my-container:old\\"
			│ +   image = \\"registry.cloudflare.com/some-account-id/my-container:Galaxy\\"
			│     instance_type = \\"dev\\"
			│     [containers.constraints]
			│
			│
			│  SUCCESS  Modified application my-container (Application ID: abc)
			│
			╰ Applied changes

			"
		`);
	});
	it("should be able to redeploy an existing application and create another", async () => {
		mockGetVersion("Galaxy-Class", [
			{
				type: "durable_object_namespace",
				namespace_id: "1",
				class_name: "ExampleDurableObject",
			},
			{
				type: "durable_object_namespace",
				namespace_id: "2",
				class_name: "DurableObjectClass2",
			},
		]);

		setupDockerMocks("my-container", "Galaxy");
		mockUploadWorkerRequest({
			expectedBindings: [
				{
					name: "EXAMPLE_DO_BINDING2",
					type: "durable_object_namespace",
					class_name: "DurableObjectClass2",
				},
				{
					name: "EXAMPLE_DO_BINDING",
					type: "durable_object_namespace",
					class_name: "ExampleDurableObject",
				},
			],
			useOldUploadApi: true,
			expectedContainers: [
				{ class_name: "ExampleDurableObject" },
				{ class_name: "DurableObjectClass2" },
			],
		});
		writeWranglerConfig({
			durable_objects: {
				bindings: [
					{
						name: "EXAMPLE_DO_BINDING2",
						class_name: "DurableObjectClass2",
					},

					{
						name: "EXAMPLE_DO_BINDING",
						class_name: "ExampleDurableObject",
					},
				],
			},
			containers: [
				DEFAULT_CONTAINER_FROM_DOCKERFILE,
				{
					name: "my-container-app-2",
					max_instances: 3,
					class_name: "DurableObjectClass2",
					image: "docker.io/hello:world",
				},
			],
		});
		fs.writeFileSync(
			"index.js",
			`export class DurableObjectClass2 {}; export class ExampleDurableObject {}; export default{};`
		);

		mockGetApplications([
			{
				id: "abc",
				name: "my-container",
				instances: 0,
				max_instances: 2,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				scheduling_policy: SchedulingPolicy.DEFAULT,
				rollout_active_grace_period: 0,
				configuration: {
					image: "registry.cloudflare.com/some-account-id/my-container:old",
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
				durable_objects: {
					namespace_id: "1",
				},
			},
		]);
		fs.writeFileSync("./Dockerfile", "FROM scratch");
		mockGenerateImageRegistryCredentials();
		mockModifyApplication({
			configuration: {
				image: "registry.cloudflare.com/some-account-id/my-container:Galaxy",
			},
			max_instances: 10,
		});
		mockCreateApplication({
			name: "my-container-app-2",
			max_instances: 3,
			scheduling_policy: SchedulingPolicy.DEFAULT,
		});
		mockCreateApplicationRollout({
			description: "Progressive update",
			strategy: "rolling",
			kind: "full_auto",
		});
		await runWrangler("deploy index.js");

		expect(std.err).toMatchInlineSnapshot(`""`);

		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container
			│
			│   [[containers]]
			│ - max_instances = 2
			│ + max_instances = 10
			│   name = \\"my-container\\"
			│   rollout_active_grace_period = 0
			│   scheduling_policy = \\"default\\"
			│     [containers.configuration]
			│ -   image = \\"registry.cloudflare.com/some-account-id/my-container:old\\"
			│ +   image = \\"registry.cloudflare.com/some-account-id/my-container:Galaxy\\"
			│     instance_type = \\"dev\\"
			│     [containers.constraints]
			│
			│
			│  SUCCESS  Modified application my-container (Application ID: abc)
			│
			╰ Applied changes

			╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ NEW my-container-app-2
			│
			│   [[containers]]
			│   name = \\"my-container-app-2\\"
			│   scheduling_policy = \\"default\\"
			│   instances = 0
			│   max_instances = 3
			│   rollout_active_grace_period = 0
			│
			│     [containers.configuration]
			│     image = \\"docker.io/hello:world\\"
			│     instance_type = \\"dev\\"
			│
			│     [containers.constraints]
			│     tier = 1
			│
			│     [containers.durable_objects]
			│     namespace_id = \\"2\\"
			│
			│
			│  SUCCESS  Created application my-container-app-2 (Application ID: undefined)
			│
			╰ Applied changes

			"
		`);
	});
	it("skips an existing application if there are no changes", async () => {
		mockGetVersion("Galaxy-Class");
		setupDockerMocks("my-container", "Galaxy");
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [DEFAULT_CONTAINER_FROM_DOCKERFILE],
		});
		mockGetApplications([
			{
				id: "abc",
				name: "my-container",
				instances: 0,
				max_instances: 10,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				scheduling_policy: SchedulingPolicy.DEFAULT,
				rollout_active_grace_period: 0,
				configuration: {
					image: "registry.cloudflare.com/some-account-id/my-container:Galaxy",
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tier: 1,
				},
				durable_objects: {
					namespace_id: "1",
				},
			},
		]);
		fs.writeFileSync("./Dockerfile", "FROM scratch");
		mockGenerateImageRegistryCredentials();

		await runWrangler("deploy index.js");

		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ no changes my-container
			│
			╰ No changes to be made

			"
		`);
	});

	it("should error when no scope for containers", async () => {
		mockContainersAccount([]);
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [DEFAULT_CONTAINER_FROM_REGISTRY],
		});

		await expect(
			runWrangler("deploy index.js")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: You need 'containers:write', try logging in again or creating an appropiate API token]`
		);
	});

	describe("rollout_percentage_steps", () => {
		it("should create rollout with *step_percentage* when rollout_step_percentage is a number", async () => {
			writeWranglerConfig({
				...DEFAULT_DURABLE_OBJECTS,
				containers: [
					{
						...DEFAULT_CONTAINER_FROM_REGISTRY,
						rollout_step_percentage: 50,
					},
				],
			});

			mockGetVersion("Galaxy-Class");

			mockGetApplications([]);

			mockCreateApplication();

			mockCreateApplicationRollout({
				description: "Progressive update",
				strategy: "rolling",
				kind: "full_auto",
				step_percentage: 50,
			});

			fs.writeFileSync(
				"index.js",
				`export class ExampleDurableObject {}; export default{};`
			);
			await runWrangler("deploy index.js");

			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should create rollout with *steps* when rollout_step_percentage is an array of numbers", async () => {
			writeWranglerConfig({
				...DEFAULT_DURABLE_OBJECTS,
				containers: [
					{
						...DEFAULT_CONTAINER_FROM_REGISTRY,
						rollout_step_percentage: [20, 30, 100],
					},
				],
			});

			mockGetVersion("Galaxy-Class");

			mockGetApplications([
				{
					id: "abc",
					name: "my-container",
					instances: 0,
					max_instances: 2,
					created_at: new Date().toString(),
					version: 1,
					account_id: "1",
					scheduling_policy: SchedulingPolicy.DEFAULT,
					configuration: {
						image: "registry.cloudflare.com/some-account-id/my-container:old",
						disk: {
							size: "2GB",
							size_mb: 2000,
						},
						vcpu: 0.0625,
						memory: "256MB",
						memory_mib: 256,
					},
					constraints: {
						tier: 1,
					},
					durable_objects: {
						namespace_id: "1",
					},
				},
			]);

			mockModifyApplication();

			mockCreateApplicationRollout({
				description: "Progressive update",
				strategy: "rolling",
				kind: "full_auto",
				steps: [
					{
						step_size: { percentage: 20 },
						description: "Step 1 of 3 - rollout at 20% of instances",
					},
					{
						step_size: { percentage: 30 },
						description: "Step 2 of 3 - rollout at 30% of instances",
					},
					{
						step_size: { percentage: 100 },
						description: "Step 3 of 3 - rollout at 100% of instances",
					},
				],
			});
			await runWrangler("deploy index.js");

			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("should override rollout to 100 if deploying with --containers-rollout=immediate ", async () => {
			writeWranglerConfig({
				...DEFAULT_DURABLE_OBJECTS,
				containers: [
					{
						...DEFAULT_CONTAINER_FROM_REGISTRY,
						rollout_step_percentage: [50, 100],
					},
				],
			});

			mockGetVersion("Galaxy-Class");

			mockGetApplications([]);

			mockCreateApplication();

			// expect to see 100
			mockCreateApplicationRollout({
				description: "Progressive update",
				strategy: "rolling",
				kind: "full_auto",
				step_percentage: 100,
			});

			fs.writeFileSync(
				"index.js",
				`export class ExampleDurableObject {}; export default{};`
			);
			await runWrangler("deploy index.js --containers-rollout=immediate");

			expect(std.err).toMatchInlineSnapshot(`""`);
		});

		it("deploying with --containers-rollout=rolling should pass through the config value of rollout_step_percentage", async () => {
			writeWranglerConfig({
				...DEFAULT_DURABLE_OBJECTS,
				containers: [
					{
						...DEFAULT_CONTAINER_FROM_REGISTRY,
						rollout_step_percentage: [50, 100],
					},
				],
			});

			mockGetVersion("Galaxy-Class");

			mockGetApplications([]);

			mockCreateApplication();

			// expect to see 100
			mockCreateApplicationRollout({
				description: "Progressive update",
				strategy: "rolling",
				kind: "full_auto",
				step_percentage: [50, 100],
			});

			fs.writeFileSync(
				"index.js",
				`export class ExampleDurableObject {}; export default{};`
			);
			await runWrangler("deploy index.js --containers-rollout=gradual");

			expect(std.err).toMatchInlineSnapshot(`""`);
		});
	});

	describe("observability config resolution", () => {
		const sharedGetApplicationResult = {
			id: "abc",
			name: "my-container",
			instances: 0,
			max_instances: 10,
			created_at: new Date().toString(),
			version: 1,
			account_id: "1",
			scheduling_policy: SchedulingPolicy.DEFAULT,
			rollout_active_grace_period: 0,
			configuration: {
				image: "docker.io/hello:world",
				disk: {
					size: "2GB",
					size_mb: 2000,
				},
				vcpu: 0.0625,
				memory: "256MB",
				memory_mib: 256,
			},
			constraints: {
				tier: 1,
			},
			durable_objects: {
				namespace_id: "1",
			},
		};
		it("should be able to enable observability logs (top level)", async () => {
			mockGetVersion("Galaxy-Class");
			writeWranglerConfig({
				...DEFAULT_DURABLE_OBJECTS,
				observability: { enabled: true },
				containers: [DEFAULT_CONTAINER_FROM_REGISTRY],
			});

			mockGetApplications([sharedGetApplicationResult]);

			mockModifyApplication({
				configuration: {
					image: "docker.io/hello:world",
					observability: { logs: { enabled: true } },
				},
			});
			mockCreateApplicationRollout();

			await runWrangler("deploy index.js");

			expect(cliStd.stdout).toMatchInlineSnapshot(`
				"╭ Deploy a container application deploy changes to your application
				│
				│ Container application changes
				│
				├ EDIT my-container
				│
				│     image = \\"docker.io/hello:world\\"
				│     instance_type = \\"dev\\"
				│ + [containers.configuration.observability.logs]
				│ + enabled = true
				│     [containers.constraints]
				│     tier = 1
				│
				│
				│  SUCCESS  Modified application my-container (Application ID: abc)
				│
				╰ Applied changes

				"
			`);
		});

		it("should be able to enable observability logs (logs field)", async () => {
			mockGetVersion("Galaxy-Class");
			writeWranglerConfig({
				...DEFAULT_DURABLE_OBJECTS,
				observability: { logs: { enabled: true } },
				containers: [DEFAULT_CONTAINER_FROM_REGISTRY],
			});

			mockGetApplications([sharedGetApplicationResult]);

			mockModifyApplication({
				configuration: {
					image: "docker.io/hello:world",
					observability: { logs: { enabled: true } },
				},
			});

			mockCreateApplicationRollout();

			await runWrangler("deploy index.js");
			expect(cliStd.stdout).toMatchInlineSnapshot(`
				"╭ Deploy a container application deploy changes to your application
				│
				│ Container application changes
				│
				├ EDIT my-container
				│
				│     image = \\"docker.io/hello:world\\"
				│     instance_type = \\"dev\\"
				│ + [containers.configuration.observability.logs]
				│ + enabled = true
				│     [containers.constraints]
				│     tier = 1
				│
				│
				│  SUCCESS  Modified application my-container (Application ID: abc)
				│
				╰ Applied changes

				"
			`);
		});

		it("should be able to disable observability logs (top level)", async () => {
			mockGetVersion("Galaxy-Class");
			writeWranglerConfig({
				...DEFAULT_DURABLE_OBJECTS,
				observability: { enabled: false },
				containers: [DEFAULT_CONTAINER_FROM_REGISTRY],
			});

			mockGetApplications([
				{
					...sharedGetApplicationResult,
					configuration: {
						...sharedGetApplicationResult.configuration,
						observability: {
							logs: {
								enabled: true,
							},
						},
					},
				},
			]);

			mockModifyApplication({
				configuration: {
					image: "docker.io/hello:world",
					observability: { logs: { enabled: false } },
				},
			});

			mockCreateApplicationRollout();

			await runWrangler("deploy index.js");

			expect(cliStd.stdout).toMatchInlineSnapshot(`
				"╭ Deploy a container application deploy changes to your application
				│
				│ Container application changes
				│
				├ EDIT my-container
				│
				│     instance_type = \\"dev\\"
				│   [containers.configuration.observability.logs]
				│ - enabled = true
				│ + enabled = false
				│     [containers.constraints]
				│     tier = 1
				│
				│
				│  SUCCESS  Modified application my-container (Application ID: abc)
				│
				╰ Applied changes

				"
			`);
		});

		it("should be able to disable observability logs (logs field)", async () => {
			mockGetVersion("Galaxy-Class");
			writeWranglerConfig({
				...DEFAULT_DURABLE_OBJECTS,
				observability: { logs: { enabled: false } },
				containers: [DEFAULT_CONTAINER_FROM_REGISTRY],
			});

			mockGetApplications([
				{
					...sharedGetApplicationResult,
					configuration: {
						...sharedGetApplicationResult.configuration,
						observability: {
							logs: {
								enabled: true,
							},
						},
					},
				},
			]);

			mockModifyApplication({
				configuration: {
					image: "docker.io/hello:world",
					observability: { logs: { enabled: false } },
				},
			});

			mockCreateApplicationRollout();

			await runWrangler("deploy index.js");

			expect(cliStd.stdout).toMatchInlineSnapshot(`
				"╭ Deploy a container application deploy changes to your application
				│
				│ Container application changes
				│
				├ EDIT my-container
				│
				│     instance_type = \\"dev\\"
				│   [containers.configuration.observability.logs]
				│ - enabled = true
				│ + enabled = false
				│     [containers.constraints]
				│     tier = 1
				│
				│
				│  SUCCESS  Modified application my-container (Application ID: abc)
				│
				╰ Applied changes

				"
			`);
		});
		it("should be able to disable observability logs (absent field)", async () => {
			mockGetVersion("Galaxy-Class");
			writeWranglerConfig({
				...DEFAULT_DURABLE_OBJECTS,
				containers: [DEFAULT_CONTAINER_FROM_REGISTRY],
			});

			mockGetApplications([
				{
					...sharedGetApplicationResult,
					configuration: {
						...sharedGetApplicationResult.configuration,
						observability: {
							logs: {
								enabled: true,
							},
						},
					},
				},
			]);

			mockModifyApplication({
				configuration: {
					image: "docker.io/hello:world",
					observability: { logs: { enabled: false } },
				},
			});

			mockCreateApplicationRollout();
			await runWrangler("deploy index.js");
			expect(cliStd.stdout).toMatchInlineSnapshot(`
				"╭ Deploy a container application deploy changes to your application
				│
				│ Container application changes
				│
				├ EDIT my-container
				│
				│     instance_type = \\"dev\\"
				│   [containers.configuration.observability.logs]
				│ - enabled = true
				│ + enabled = false
				│     [containers.constraints]
				│     tier = 1
				│
				│
				│  SUCCESS  Modified application my-container (Application ID: abc)
				│
				╰ Applied changes

				"
			`);
		});
		it("should ignore deprecated observability.logging field from the api", async () => {
			mockGetVersion("Galaxy-Class");
			writeWranglerConfig({
				...DEFAULT_DURABLE_OBJECTS,
				containers: [DEFAULT_CONTAINER_FROM_REGISTRY],
			});

			mockGetApplications([
				{
					...sharedGetApplicationResult,
					configuration: {
						...sharedGetApplicationResult.configuration,
						observability: {
							logging: {
								enabled: false,
							},
							logs: {
								enabled: true,
							},
						},
					},
				},
			]);

			mockModifyApplication({
				configuration: {
					image: "docker.io/hello:world",
					observability: { logs: { enabled: false } },
				},
			});

			mockCreateApplicationRollout();

			await runWrangler("deploy index.js");

			expect(cliStd.stdout).toMatchInlineSnapshot(`
				"╭ Deploy a container application deploy changes to your application
				│
				│ Container application changes
				│
				├ EDIT my-container
				│
				│     instance_type = \\"dev\\"
				│   [containers.configuration.observability.logs]
				│ - enabled = true
				│ + enabled = false
				│     [containers.constraints]
				│     tier = 1
				│
				│
				│  SUCCESS  Modified application my-container (Application ID: abc)
				│
				╰ Applied changes

				"
			`);
		});
		it("should keep observability logs enabled", async () => {
			mockGetVersion("Galaxy-Class");
			writeWranglerConfig({
				...DEFAULT_DURABLE_OBJECTS,
				observability: { enabled: true },
				containers: [DEFAULT_CONTAINER_FROM_REGISTRY],
			});

			mockGetApplications([
				{
					...sharedGetApplicationResult,
					configuration: {
						...sharedGetApplicationResult.configuration,
						observability: {
							logs: {
								enabled: true,
							},
						},
					},
				},
			]);

			mockModifyApplication({
				configuration: {
					image: "docker.io/hello:world",
					observability: { logs: { enabled: true } },
				},
			});

			mockCreateApplicationRollout();

			await runWrangler("deploy index.js");
			expect(cliStd.stdout).toMatchInlineSnapshot(`
				"╭ Deploy a container application deploy changes to your application
				│
				│ Container application changes
				│
				├ no changes my-container
				│
				╰ No changes to be made

				"
			`);
		});

		it("should keep obserability logs disabled if api returns false and undefined in config", async () => {
			mockGetVersion("Galaxy-Class");
			writeWranglerConfig({
				...DEFAULT_DURABLE_OBJECTS,
				containers: [DEFAULT_CONTAINER_FROM_REGISTRY],
			});

			mockGetApplications([
				{
					...sharedGetApplicationResult,
					configuration: {
						...sharedGetApplicationResult.configuration,
						observability: {
							logs: {
								enabled: false,
							},
							logging: {
								enabled: false,
							},
						},
					},
				},
			]);

			await runWrangler("deploy index.js");

			expect(cliStd.stdout).toMatchInlineSnapshot(`
				"╭ Deploy a container application deploy changes to your application
				│
				│ Container application changes
				│
				├ no changes my-container
				│
				╰ No changes to be made

				"
			`);
		});
	});

	it("should expand image names from managed registry", async () => {
		mockGetVersion("Galaxy-Class");
		const registry = getCloudflareContainerRegistry();
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [
				{
					name: "my-container",
					max_instances: 10,
					class_name: "ExampleDurableObject",
					image: `${registry}/hello:1.0`,
					instance_type: "dev",
					constraints: {
						tier: 2,
					},
				},
			],
		});

		mockGetApplications([]);

		mockCreateApplication({
			name: "my-container",
			max_instances: 10,
			configuration: {
				image: `${registry}/some-account-id/hello:1.0`,
				instance_type: InstanceType.DEV,
			},
		});

		await runWrangler("deploy index.js");

		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ NEW my-container
			│
			│   [[containers]]
			│   name = \\"my-container\\"
			│   scheduling_policy = \\"default\\"
			│   instances = 0
			│   max_instances = 10
			│   rollout_active_grace_period = 0
			│
			│     [containers.configuration]
			│     image = \\"registry.cloudflare.com/some-account-id/hello:1.0\\"
			│     instance_type = \\"dev\\"
			│
			│     [containers.constraints]
			│     tier = 2
			│
			│     [containers.durable_objects]
			│     namespace_id = \\"1\\"
			│
			│
			│  SUCCESS  Created application my-container (Application ID: undefined)
			│
			╰ Applied changes

			"
		`);
	});
});

// This is a separate describe block because we intentionally do not mock any
// API tokens, account ID, or authorization. The purpose of these tests is to
// ensure that --dry-run mode works without requiring any API access.
describe("wrangler deploy with containers dry run", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const cliStd = mockCLIOutput();
	beforeEach(() => {
		clearCachedAccount();
		expect(process.env.CLOUDFLARE_API_TOKEN).toBeUndefined();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("builds the image without pushing", async () => {
		// Reduced mock chain for dry run (no delete, push)
		vi.mocked(spawn)
			.mockImplementationOnce(mockDockerInfo())
			.mockImplementationOnce(
				mockDockerBuild("my-container", "worker", "FROM scratch", process.cwd())
			);
		vi.stubEnv("WRANGLER_DOCKER_BIN", "/usr/bin/docker");
		fs.writeFileSync("./Dockerfile", "FROM scratch");
		fs.writeFileSync(
			"index.js",
			`export class ExampleDurableObject {}; export default{};`
		);
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [DEFAULT_CONTAINER_FROM_DOCKERFILE],
		});

		await runWrangler("deploy --dry-run index.js");
		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Building image my-container:worker
			Your Worker has access to the following bindings:
			Binding                                            Resource
			env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

			--dry-run: exiting now."
		`);
		expect(cliStd.stdout).toMatchInlineSnapshot(`""`);
	});

	it("builds the image without pushing", async () => {
		// No docker mocks at all

		fs.writeFileSync(
			"index.js",
			`export class ExampleDurableObject {}; export default{};`
		);
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [DEFAULT_CONTAINER_FROM_REGISTRY],
		});

		await runWrangler("deploy --dry-run index.js");
		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Your Worker has access to the following bindings:
			Binding                                            Resource
			env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

			--dry-run: exiting now."
		`);
		expect(cliStd.stdout).toMatchInlineSnapshot(`""`);
	});
});

// Docker mock factory
function createDockerMockChain(
	containerName: string,
	tag: string,
	dockerfilePath?: string,
	buildContext?: string
) {
	const mocks = [
		mockDockerInfo(),
		mockDockerBuild(
			containerName,
			tag,
			dockerfilePath || "FROM scratch",
			buildContext || process.cwd()
		),
		mockDockerImageInspectDigests(containerName, tag),
		mockDockerImageInspectSize(containerName, tag),
		mockDockerLogin("mockpassword"),
		// Skip manifest inspect mock - it's not being called due to empty repoDigests
		mockDockerTag(containerName, "some-account-id/" + containerName, tag),
		mockDockerPush("some-account-id/" + containerName, tag),
		mockDockerImageDelete("some-account-id/" + containerName, tag),
	];

	return mocks;
}

function setupDockerMocks(
	containerName: string,
	tag: string,
	dockerfilePath?: string,
	buildContext?: string
) {
	const mocks = createDockerMockChain(
		containerName,
		tag,
		dockerfilePath,
		buildContext
	);
	vi.mocked(spawn)
		.mockImplementationOnce(mocks[0])
		.mockImplementationOnce(mocks[1])
		.mockImplementationOnce(mocks[2])
		.mockImplementationOnce(mocks[3])
		.mockImplementationOnce(mocks[4])
		.mockImplementationOnce(mocks[5])
		.mockImplementationOnce(mocks[6])
		.mockImplementationOnce(mocks[7]);
	// Default mock for execFileSync to handle docker verification and other calls
	vi.mocked(execFileSync).mockImplementation(
		(_file: string, args?: readonly string[]) => {
			// Handle docker info calls (for verification)
			if (args && args[0] === "manifest") {
				return "i promise I am an unsuccessful docker manifest call";
			}
			return "";
		}
	);
}

// Common test setup
function setupCommonMocks() {
	msw.use(...mswSuccessDeploymentScriptMetadata);
	msw.use(...mswListNewDeploymentsLatestFull);
	mockSubDomainRequest();
	mockLegacyScriptData({
		scripts: [{ id: "test-name", migration_tag: "v1" }],
	});
	mockContainersAccount();
	mockUploadWorkerRequest({
		expectedBindings: [
			{
				class_name: "ExampleDurableObject",
				name: "EXAMPLE_DO_BINDING",
				type: "durable_object_namespace",
			},
		],
		useOldUploadApi: true,
		expectedContainers: [{ class_name: "ExampleDurableObject" }],
	});
}

const DEFAULT_DURABLE_OBJECTS = {
	durable_objects: {
		bindings: [
			{
				name: "EXAMPLE_DO_BINDING",
				class_name: "ExampleDurableObject",
			},
		],
	},
	migrations: [{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] }],
};

const DEFAULT_CONTAINER_FROM_REGISTRY = {
	name: "my-container",
	max_instances: 10,
	class_name: "ExampleDurableObject",
	image: "docker.io/hello:world",
};
const DEFAULT_CONTAINER_FROM_DOCKERFILE = {
	name: "my-container",
	max_instances: 10,
	class_name: "ExampleDurableObject",
	image: "./Dockerfile",
};

const defaultDOBinding = {
	type: "durable_object_namespace",
	namespace_id: "1",
	class_name: "ExampleDurableObject",
};
function mockGetVersion(versionId: string, bindings = [defaultDOBinding]) {
	msw.use(
		http.get(
			`*/accounts/:accountId/workers/scripts/:scriptName/versions/${versionId}`,
			async () => {
				return HttpResponse.json(
					createFetchResult({
						id: versionId,
						metadata: {},
						number: 2,
						resources: {
							bindings,
						},
					})
				);
			}
		)
	);
}

function defaultChildProcess() {
	return {
		stderr: Buffer.from([]),
		stdout: Buffer.from("i promise I am a successful process"),
		on: function (reason: string, cbPassed: (code: number) => unknown) {
			if (reason === "close") {
				cbPassed(0);
			}

			return this;
		},
	} as unknown as ChildProcess;
}

function mockCreateApplication(expected?: Partial<Application>) {
	msw.use(
		http.post("*/applications", async ({ request }) => {
			const json = await request.json();
			if (expected !== undefined) {
				expect(json).toMatchObject(expected);
			}

			return HttpResponse.json({ success: true, result: json });
		})
	);
}

function mockModifyApplication(expected?: Partial<Application>) {
	msw.use(
		http.patch("*/applications/:id", async ({ request }) => {
			const json = await request.json();
			if (expected !== undefined) {
				expect(json).toMatchObject(expected);
			}
			expect((json as CreateApplicationRequest).name).toBeUndefined();
			return HttpResponse.json({
				success: true,
				result: {
					id: "abc",
					name: "my-container",
					...(json as Record<string, unknown>),
				},
			});
		})
	);
}

function mockCreateApplicationRollout(expected?: Record<string, unknown>) {
	msw.use(
		http.post("*/applications/:id/rollouts", async ({ request }) => {
			const json = await request.json();
			console.dir(json);
			console.dir(expected);
			if (expected !== undefined) {
				expect(json).toMatchObject(expected);
			}
			return HttpResponse.json({
				success: true,
				result: {
					id: "rollout-123",
					status: "pending",
					...(json as Record<string, unknown>),
				},
			});
		})
	);
}

function mockGenerateImageRegistryCredentials() {
	msw.use(
		http.post(
			`*/registries/${getCloudflareContainerRegistry()}/credentials`,
			async ({ request }) => {
				const json =
					(await request.json()) as ImageRegistryCredentialsConfiguration;
				expect(json.permissions).toEqual(["push", "pull"]);

				return HttpResponse.json({
					success: true,
					result: {
						account_id: "some-account-id",
						registry_host: getCloudflareContainerRegistry(),
						username: "v1",
						password: "mockpassword",
					} as AccountRegistryToken,
				});
			},
			{ once: true }
		)
	);
}
function mockGetApplications(applications: Application[]) {
	msw.use(
		http.get("*/applications", async () => {
			return HttpResponse.json({ success: true, result: applications });
		})
	);
}

function mockDockerInfo() {
	return (cmd: string, args: readonly string[]) => {
		expect(cmd).toBe("/usr/bin/docker");
		expect(args).toEqual(["info"]);
		return defaultChildProcess();
	};
}

function mockDockerBuild(
	containerName: string,
	tag: string,
	expectedDockerfile: string,
	buildContext: string
) {
	return (cmd: string, args: readonly string[]) => {
		expect(cmd).toBe("/usr/bin/docker");
		expect(args).toEqual([
			"build",
			"-t",
			`${getCloudflareContainerRegistry()}/${containerName}:${tag}`,
			"--platform",
			"linux/amd64",
			"--provenance=false",
			"-f",
			"-",
			buildContext,
		]);

		let dockerfile = "";
		const readable = new Writable({
			write(chunk) {
				dockerfile += chunk;
			},
			final() {},
		});
		return {
			pid: -1,
			error: undefined,
			stderr: Buffer.from([]),
			stdout: Buffer.from("i promise I am a successful docker build"),
			stdin: readable,
			status: 0,
			signal: null,
			output: [null],
			on: (reason: string, cbPassed: (code: number) => unknown) => {
				if (reason === "exit") {
					expect(dockerfile).toEqual(expectedDockerfile);
					cbPassed(0);
				}
			},
		} as unknown as ChildProcess;
	};
}

function mockDockerImageInspectDigests(containerName: string, tag: string) {
	return (cmd: string, args: readonly string[]) => {
		expect(cmd).toBe("/usr/bin/docker");
		expect(args).toEqual([
			"image",
			"inspect",
			`${getCloudflareContainerRegistry()}/${containerName}:${tag}`,
			"--format",
			"{{ json .RepoDigests }} {{ .Id }}",
		]);

		const stdout = new PassThrough();
		const stderr = new PassThrough();

		const child = {
			stdout,
			stderr,
			on(event: string, cb: (code: number) => void) {
				if (event === "close") {
					setImmediate(() => cb(0));
				}
				return this;
			},
		};

		setImmediate(() => {
			stdout.emit(
				"data",
				`["${getCloudflareContainerRegistry()}/${containerName}@sha256:three"] config-sha`
			);
		});

		return child as unknown as ChildProcess;
	};
}

function mockDockerImageInspectSize(containerName: string, tag: string) {
	return (cmd: string, args: readonly string[]) => {
		expect(cmd).toBe("/usr/bin/docker");
		expect(args).toEqual([
			"image",
			"inspect",
			`${getCloudflareContainerRegistry()}/${containerName}:${tag}`,
			"--format",
			"{{ .Size }} {{ len .RootFS.Layers }}",
		]);

		const stdout = new PassThrough();
		const stderr = new PassThrough();

		const child = {
			stdout,
			stderr,
			on(event: string, cb: (code: number) => void) {
				if (event === "close") {
					setImmediate(() => cb(0));
				}
				return this;
			},
		};

		setImmediate(() => {
			stdout.emit("data", "123456 4");
		});

		return child as unknown as ChildProcess;
	};
}

function mockDockerImageDelete(containerName: string, tag: string) {
	return (cmd: string, args: readonly string[]) => {
		expect(cmd).toBe("/usr/bin/docker");
		expect(args).toEqual([
			"image",
			"rm",
			`${getCloudflareContainerRegistry()}/${containerName}:${tag}`,
		]);
		return defaultChildProcess();
	};
}

function mockDockerLogin(expectedPassword: string) {
	return (cmd: string, _args: readonly string[]) => {
		expect(cmd).toBe("/usr/bin/docker");
		let password = "";
		const readable = new Writable({
			write(chunk) {
				password += chunk;
			},
			final() {},
		});
		return {
			stdout: Buffer.from("i promise I am a successful docker login"),
			stdin: readable,
			on: function (reason: string, cbPassed: (code: number) => unknown) {
				if (reason === "close") {
					expect(password).toEqual(expectedPassword);
					cbPassed(0);
				}
				return this;
			},
		} as unknown as ChildProcess;
	};
}

function mockDockerPush(containerName: string, tag: string) {
	return (cmd: string, args: readonly string[]) => {
		expect(cmd).toBe("/usr/bin/docker");
		expect(args).toEqual([
			"push",
			`${getCloudflareContainerRegistry()}/${containerName}:${tag}`,
		]);
		return defaultChildProcess();
	};
}

function mockDockerTag(from: string, to: string, tag: string) {
	return (cmd: string, args: readonly string[]) => {
		expect(cmd).toBe("/usr/bin/docker");
		expect(args).toEqual([
			"tag",
			`${getCloudflareContainerRegistry()}/${from}:${tag}`,
			`${getCloudflareContainerRegistry()}/${to}:${tag}`,
		]);
		return defaultChildProcess();
	};
}
