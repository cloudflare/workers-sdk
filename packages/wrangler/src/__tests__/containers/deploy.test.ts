import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import {
	getCloudflareContainerRegistry,
	InstanceType,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import { ApplicationAffinityHardwareGeneration } from "@cloudflare/containers-shared/src/client/models/ApplicationAffinityHardwareGeneration";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCachedAccount } from "../../cloudchamber/locations";
import { mockAccountV4 as mockContainersAccount } from "../cloudchamber/utils";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockCLIOutput } from "../helpers/mock-cli-output";
import { mockConsoleMethods } from "../helpers/mock-console";
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
	it("should fail early if the account id doesn't match the account id in the image uri", async () => {
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [
				{
					name: "my-container",
					class_name: "ExampleDurableObject",
					image:
						"registry.cloudflare.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/hello:world",
				},
			],
		});
		await expect(runWrangler("deploy index.js")).rejects
			.toThrowErrorMatchingInlineSnapshot(`
			[Error: Image "registry.cloudflare.com/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/hello:world" does not belong to your account
			Image appears to belong to account: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
			Current account: "some-account-id"]
		`);
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
			durable_objects: {
				// uses namespace_id when the DO is a binding
				namespace_id: "1",
			},
		});

		await runWrangler("deploy index.js");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding                                            Resource
			env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

			The following containers are available:
			- my-container (<cwd>/Dockerfile)

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
			│   [containers.configuration]
			│   image = \\"registry.cloudflare.com/some-account-id/my-container:Galaxy\\"
			│   instance_type = \\"lite\\"
			│
			│   [containers.constraints]
			│   tiers = [ 1, 2 ]
			│
			│   [containers.durable_objects]
			│   namespace_id = \\"1\\"
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding                                            Resource
			env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

			The following containers are available:
			- my-container (registry.cloudflare.com/hello:world)

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
			│   [containers.configuration]
			│   image = \\"registry.cloudflare.com/some-account-id/hello:world\\"
			│   instance_type = \\"lite\\"
			│
			│   [containers.constraints]
			│   tiers = [ 1, 2 ]
			│
			│   [containers.durable_objects]
			│   namespace_id = \\"1\\"
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
				image: "registry.cloudflare.com/some-account-id/hello:world",
				disk: {
					size_mb: 2000,
				},
				vcpu: 1,
				memory_mib: 1000,
			},
		});

		await runWrangler("deploy index.js");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding                                            Resource
			env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

			The following containers are available:
			- my-container (registry.cloudflare.com/hello:world)

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
			│   [containers.configuration]
			│   image = \\"registry.cloudflare.com/some-account-id/hello:world\\"
			│   memory_mib = 1000
			│   vcpu = 1
			│
			│   [containers.configuration.disk]
			│   size_mb = 2000
			│
			│   [containers.constraints]
			│   tiers = [ 1, 2 ]
			│
			│   [containers.durable_objects]
			│   namespace_id = \\"1\\"
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
				image: "registry.cloudflare.com/some-account-id/hello:world",
				disk: {
					size_mb: 2000,
				},
				vcpu: 1,
				memory_mib: 1000,
			},
		});

		await runWrangler("deploy index.js");

		expect(std.out).toMatchInlineSnapshot(`
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding                                            Resource
			env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

			The following containers are available:
			- my-container (registry.cloudflare.com/hello:world)

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
			│   [containers.configuration]
			│   image = \\"registry.cloudflare.com/some-account-id/hello:world\\"
			│   memory_mib = 1000
			│   vcpu = 1
			│
			│   [containers.configuration.disk]
			│   size_mb = 2000
			│
			│   [containers.constraints]
			│   tiers = [ 1, 2 ]
			│
			│   [containers.durable_objects]
			│   namespace_id = \\"1\\"
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

		// we filter stdout normally to replace cwd since that is temporary
		// however in this case since we pass a cwd to wrangler, the cwd wrangler runs in
		// is different from the cwd for the test so our normal matching doesn't work
		const wranglerCWD = process.cwd().split(path.sep);
		wranglerCWD.splice(-1, 1);
		expect(std.out.replace(wranglerCWD.join("/"), "<test-cwd>"))
			.toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				Your Worker has access to the following bindings:
				Binding                                            Resource
				env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

				The following containers are available:
				- my-container (<test-cwd>/Dockerfile)

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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding                                            Resource
			env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

			The following containers are available:
			- my-container (<cwd>/Dockerfile)

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
					tiers: [1, 2],
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
			│   [containers.configuration]
			│ - image = \\"registry.cloudflare.com/some-account-id/my-container:old\\"
			│ + image = \\"registry.cloudflare.com/some-account-id/my-container:Galaxy\\"
			│   instance_type = \\"lite\\"
			│   [containers.constraints]
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
			migrations: [
				{
					tag: "v1",
					new_sqlite_classes: ["DurableObjectClass2", "ExampleDurableObject"],
				},
			],
			containers: [
				DEFAULT_CONTAINER_FROM_DOCKERFILE,
				{
					name: "my-container-app-2",
					max_instances: 3,
					class_name: "DurableObjectClass2",
					image: "registry.cloudflare.com/hello:world",
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
					tiers: [1, 2],
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
			│   [containers.configuration]
			│ - image = \\"registry.cloudflare.com/some-account-id/my-container:old\\"
			│ + image = \\"registry.cloudflare.com/some-account-id/my-container:Galaxy\\"
			│   instance_type = \\"lite\\"
			│   [containers.constraints]
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
			│   [containers.configuration]
			│   image = \\"registry.cloudflare.com/some-account-id/hello:world\\"
			│   instance_type = \\"lite\\"
			│
			│   [containers.constraints]
			│   tiers = [ 1, 2 ]
			│
			│   [containers.durable_objects]
			│   namespace_id = \\"2\\"
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
					tiers: [1, 2],
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
						tiers: [1, 2],
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
				image: "registry.cloudflare.com/hello:world",
				disk: {
					size: "2GB",
					size_mb: 2000,
				},
				vcpu: 0.0625,
				memory: "256MB",
				memory_mib: 256,
			},
			constraints: {
				tiers: [1, 2],
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
					image: "registry.cloudflare.com/some-account-id/hello:world",
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
				│   image = \\"registry.cloudflare.com/some-account-id/hello:world\\"
				│   instance_type = \\"lite\\"
				│ + [containers.configuration.observability.logs]
				│ + enabled = true
				│   [containers.constraints]
				│   tiers = [ 1, 2 ]
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
					image: "registry.cloudflare.com/some-account-id/hello:world",
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
				│   image = \\"registry.cloudflare.com/some-account-id/hello:world\\"
				│   instance_type = \\"lite\\"
				│ + [containers.configuration.observability.logs]
				│ + enabled = true
				│   [containers.constraints]
				│   tiers = [ 1, 2 ]
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
					image: "registry.cloudflare.com/some-account-id/hello:world",
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
				│   instance_type = \\"lite\\"
				│   [containers.configuration.observability.logs]
				│ - enabled = true
				│ + enabled = false
				│   [containers.constraints]
				│   tiers = [ 1, 2 ]
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
					image: "registry.cloudflare.com/some-account-id/hello:world",
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
				│   instance_type = \\"lite\\"
				│   [containers.configuration.observability.logs]
				│ - enabled = true
				│ + enabled = false
				│   [containers.constraints]
				│   tiers = [ 1, 2 ]
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
					image: "registry.cloudflare.com/some-account-id/hello:world",
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
				│   instance_type = \\"lite\\"
				│   [containers.configuration.observability.logs]
				│ - enabled = true
				│ + enabled = false
				│   [containers.constraints]
				│   tiers = [ 1, 2 ]
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
					image: "registry.cloudflare.com/some-account-id/hello:world",
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
					instance_type: "lite",
					constraints: {
						tiers: [2],
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
				instance_type: InstanceType.LITE,
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
			│   [containers.configuration]
			│   image = \\"registry.cloudflare.com/some-account-id/hello:1.0\\"
			│   instance_type = \\"lite\\"
			│
			│   [containers.constraints]
			│   tiers = [ 2 ]
			│
			│   [containers.durable_objects]
			│   namespace_id = \\"1\\"
			│
			│
			│  SUCCESS  Created application my-container (Application ID: undefined)
			│
			╰ Applied changes

			"
		`);
	});

	describe("affinities", () => {
		it("may be specified on creation", async () => {
			mockGetVersion("Galaxy-Class");
			writeWranglerConfig({
				...DEFAULT_DURABLE_OBJECTS,
				containers: [
					{
						...DEFAULT_CONTAINER_FROM_REGISTRY,
						affinities: {
							hardware_generation: "highest-overall-performance",
						},
					},
				],
			});

			mockGetApplications([]);

			mockCreateApplication();

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
				│   [containers.configuration]
				│   image = \\"registry.cloudflare.com/some-account-id/hello:world\\"
				│   instance_type = \\"lite\\"
				│
				│   [containers.constraints]
				│   tiers = [ 1, 2 ]
				│
				│   [containers.affinities]
				│   hardware_generation = \\"highest-overall-performance\\"
				│
				│   [containers.durable_objects]
				│   namespace_id = \\"1\\"
				│
				│
				│  SUCCESS  Created application my-container (Application ID: undefined)
				│
				╰ Applied changes

				"
			`);
		});

		it("may be specified on modification", async () => {
			mockGetVersion("Galaxy-Class");
			writeWranglerConfig({
				...DEFAULT_DURABLE_OBJECTS,
				containers: [
					{
						...DEFAULT_CONTAINER_FROM_REGISTRY,
						affinities: {
							hardware_generation: "highest-overall-performance",
						},
					},
				],
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
						image: "registry.cloudflare.com/hello:world",
						disk: {
							size: "2GB",
							size_mb: 2000,
						},
						vcpu: 0.0625,
						memory: "256MB",
						memory_mib: 256,
					},
					constraints: {
						tiers: [1, 2],
					},
					durable_objects: {
						namespace_id: "1",
					},
				},
			]);

			mockModifyApplication({
				affinities: {
					hardware_generation:
						ApplicationAffinityHardwareGeneration.HIGHEST_OVERALL_PERFORMANCE,
				},
			});
			mockCreateApplicationRollout({
				description: "Progressive update",
				strategy: "rolling",
				kind: "full_auto",
			});

			await runWrangler("deploy index.js");

			expect(cliStd.stdout).toMatchInlineSnapshot(`
				"╭ Deploy a container application deploy changes to your application
				│
				│ Container application changes
				│
				├ EDIT my-container
				│
				│   [containers.constraints]
				│   tiers = [ 1, 2 ]
				│ + [containers.affinities]
				│ + hardware_generation = \\"highest-overall-performance\\"
				│
				│
				│  SUCCESS  Modified application my-container (Application ID: abc)
				│
				╰ Applied changes

				"
			`);
		});
	});

	it("should not repush image if it already exists remotely", async () => {
		mockGetVersion("Galaxy-Class");
		const containerName = "my-container";
		const tag = "Galaxy";
		vi.mocked(spawn).mockReset();
		vi.mocked(spawn)
			.mockImplementationOnce(mockDockerInfo())
			.mockImplementationOnce(
				mockDockerBuild(containerName, tag, "FROM scratch", process.cwd())
			)
			.mockImplementationOnce(
				mockDockerImageInspectDigestsWithRepoDigest(
					containerName,
					tag,
					"sha256:three"
				)
			)
			.mockImplementationOnce(mockDockerImageInspectSize(containerName, tag))
			.mockImplementationOnce(mockDockerLogin("mockpassword"))
			// Mock docker image rm call since we skip the push
			.mockImplementationOnce(mockDockerImageDelete(containerName, tag));
		// // Add fallback mocks in case we fall through to push (for debugging)
		// .mockImplementationOnce(
		// 	mockDockerTag(containerName, `some-account-id/${containerName}`, tag)
		// )
		// .mockImplementationOnce(
		// 	mockDockerPush(`some-account-id/${containerName}`, tag)
		// )
		// .mockImplementationOnce(
		// 	mockDockerImageDelete(`some-account-id/${containerName}`, tag)
		// );

		vi.mocked(execFileSync).mockImplementation(
			(_file: string, args?: readonly string[]) => {
				if (args && args[0] === "manifest" && args[1] === "inspect") {
					// Verify the format: registry.cloudflare.com/account-id/image@hash
					expect(args[3]).toBe(
						`${getCloudflareContainerRegistry()}/some-account-id/${containerName}@sha256:three`
					);
					// Return a manifest that matches the sha, indicating the image exists remotely
					return JSON.stringify({
						Descriptor: {
							digest: "sha256:three",
						},
					});
				}
				return "";
			}
		);

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
					image: `${getCloudflareContainerRegistry()}/some-account-id/my-container:Galaxy`,
					disk: {
						size: "2GB",
						size_mb: 2000,
					},
					vcpu: 0.0625,
					memory: "256MB",
					memory_mib: 256,
				},
				constraints: {
					tiers: [1, 2],
				},
				durable_objects: {
					namespace_id: "1",
				},
			},
		]);
		fs.writeFileSync("./Dockerfile", "FROM scratch");
		mockGenerateImageRegistryCredentials();

		await runWrangler("deploy index.js");

		expect(std.out).toContain("Image already exists remotely, skipping push");
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
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
	});

	it("should enable ssh when provided for new container", async () => {
		mockGetVersion("Galaxy-Class");
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [
				{
					...DEFAULT_CONTAINER_FROM_REGISTRY,
					wrangler_ssh: {
						enabled: true,
						port: 1010,
					},
					authorized_keys: [
						{
							name: "jeff",
							public_key:
								"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC0chNcjRotdsxXTwPPNoqVCGn4EcEWdUkkBPNm/v4gm",
						},
					],
				},
			],
		});

		mockGetApplications([]);

		mockCreateApplication({
			name: "my-container",
			max_instances: 10,
			scheduling_policy: SchedulingPolicy.DEFAULT,
			configuration: {
				image: "registry.cloudflare.com/some-account-id/hello:world",
				wrangler_ssh: {
					enabled: true,
					port: 1010,
				},
				authorized_keys: [
					{
						name: "jeff",
						public_key:
							"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC0chNcjRotdsxXTwPPNoqVCGn4EcEWdUkkBPNm/v4gm",
					},
				],
			},
		});

		await runWrangler("deploy index.js");

		expect(std.warn).toBe("");
		expect(std.err).toBe("");

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
			│   [containers.configuration]
			│   image = \\"registry.cloudflare.com/some-account-id/hello:world\\"
			│   instance_type = \\"lite\\"
			│
			│   [containers.configuration.wrangler_ssh]
			│   enabled = true
			│   port = 1010
			│
			│   [[containers.configuration.authorized_keys]]
			│   name = \\"jeff\\"
			│   public_key = \\"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC0chNcjRotdsxXTwPPNoqVCGn4EcEWdUkkBPNm/v4gm\\"
			│
			│   [containers.constraints]
			│   tiers = [ 1, 2 ]
			│
			│   [containers.durable_objects]
			│   namespace_id = \\"1\\"
			│
			│
			│  SUCCESS  Created application my-container (Application ID: undefined)
			│
			╰ Applied changes

			"
		`);
	});

	it("should enable ssh when provided for an existing container", async () => {
		mockGetVersion("Galaxy-Class");
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [
				{
					...DEFAULT_CONTAINER_FROM_REGISTRY,
					wrangler_ssh: {
						enabled: true,
					},
					authorized_keys: [
						{
							name: "jeff",
							public_key:
								"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC0chNcjRotdsxXTwPPNoqVCGn4EcEWdUkkBPNm/v4gm",
						},
					],
				},
			],
		});

		mockGetApplications([
			{
				id: "abc",
				instances: 0,
				created_at: new Date().toString(),
				version: 1,
				account_id: "1",
				name: "my-container",
				max_instances: 10,
				scheduling_policy: SchedulingPolicy.DEFAULT,
				configuration: {
					image: "registry.cloudflare.com/hello:world",
				},
				durable_objects: {
					namespace_id: "1",
				},
			},
		]);

		mockModifyApplication({
			configuration: {
				image: "registry.cloudflare.com/some-account-id/hello:world",
				wrangler_ssh: {
					enabled: true,
				},
				authorized_keys: [
					{
						name: "jeff",
						public_key:
							"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC0chNcjRotdsxXTwPPNoqVCGn4EcEWdUkkBPNm/v4gm",
					},
				],
			},
		});

		mockCreateApplicationRollout({
			description: "Progressive update",
			strategy: "rolling",
			kind: "full_auto",
		});

		await runWrangler("deploy index.js");

		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);

		expect(cliStd.stdout).toMatchInlineSnapshot(`
			"╭ Deploy a container application deploy changes to your application
			│
			│ Container application changes
			│
			├ EDIT my-container
			│
			│   name = \\"my-container\\"
			│   scheduling_policy = \\"default\\"
			│   version = 1
			│ + rollout_active_grace_period = 0
			│   [containers.configuration]
			│ - image = \\"registry.cloudflare.com/hello:world\\"
			│ + image = \\"registry.cloudflare.com/some-account-id/hello:world\\"
			│ + instance_type = \\"lite\\"
			│ + [[containers.configuration.authorized_keys]]
			│ + name = \\"jeff\\"
			│ + public_key = \\"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC0chNcjRotdsxXTwPPNoqVCGn4EcEWdUkkBPNm/v4gm\\"
			│ + [containers.configuration.wrangler_ssh]
			│ + enabled = true
			│   [containers.durable_objects]
			│   namespace_id = \\"1\\"
			│ + [containers.constraints]
			│ + tiers = [ 1, 2 ]
			│
			│
			│  SUCCESS  Modified application my-container (Application ID: abc)
			│
			╰ Applied changes

			"
		`);
	});

	describe("ctx.exports", async () => {
		// note how mockGetVersion is NOT mocked in any of these, unlike the other tests.
		// instead we mock the list durable objects endpoint, which the ctx.exports path uses instead
		it("should be able to deploy a new container", async () => {
			writeWranglerConfig({
				// no DO!
				migrations: [
					{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] },
				],
				containers: [
					{
						...DEFAULT_CONTAINER_FROM_REGISTRY,
						rollout_active_grace_period: 600,
					},
				],
			});

			mockGetApplications([]);
			mockListDurableObjects([
				{
					id: "some-id",
					name: "name",
					script: "test-name",
					class: "ExampleDurableObject",
				},
			]);
			mockUploadWorkerRequest({
				expectedBindings: [],
				useOldUploadApi: true,
				expectedContainers: [{ class_name: "ExampleDurableObject" }],
			});
			mockCreateApplication({
				name: "my-container",
				max_instances: 10,
				scheduling_policy: SchedulingPolicy.DEFAULT,
				rollout_active_grace_period: 600,
				durable_objects: {
					namespace_id: "some-id",
				},
			});

			await runWrangler("deploy index.js");

			expect(std.out).toMatchInlineSnapshot(`
				"
				 ⛅️ wrangler x.x.x
				──────────────────
				Total Upload: xx KiB / gzip: xx KiB
				Worker Startup Time: 100 ms
				The following containers are available:
				- my-container (registry.cloudflare.com/hello:world)

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
				│   [containers.configuration]
				│   image = \\"registry.cloudflare.com/some-account-id/hello:world\\"
				│   instance_type = \\"lite\\"
				│
				│   [containers.constraints]
				│   tiers = [ 1, 2 ]
				│
				│   [containers.durable_objects]
				│   namespace_id = \\"some-id\\"
				│
				│
				│  SUCCESS  Created application my-container (Application ID: undefined)
				│
				╰ Applied changes

				"
			`);
		});

		it("should error if a container name has been used before but attached to a different DO", async () => {
			writeWranglerConfig({
				migrations: [
					{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] },
				],
				containers: [
					{
						...DEFAULT_CONTAINER_FROM_REGISTRY,
						rollout_active_grace_period: 600,
					},
				],
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
						image: `${getCloudflareContainerRegistry()}/some-account-id/my-container:Galaxy`,
						disk: {
							size: "2GB",
							size_mb: 2000,
						},
						vcpu: 0.0625,
						memory: "256MB",
						memory_mib: 256,
					},
					constraints: {
						tiers: [1, 2],
					},
					durable_objects: {
						namespace_id: "something-else",
					},
				},
			]);
			mockListDurableObjects([
				{
					id: "something",
					name: "name",
					script: "test-name",
					class: "ExampleDurableObject",
				},
			]);
			mockUploadWorkerRequest({
				expectedBindings: [],
				useOldUploadApi: true,
				expectedContainers: [{ class_name: "ExampleDurableObject" }],
			});

			await expect(
				runWrangler("deploy index.js")
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: There is already an application with the name my-container deployed that is associated with a different durable object namespace (something-else). Either change the container name or delete the existing application first.]`
			);
		});

		it("should be able to redeploy an existing application", async () => {
			writeWranglerConfig({
				migrations: [
					{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] },
				],
				containers: [
					{
						...DEFAULT_CONTAINER_FROM_REGISTRY,
						rollout_active_grace_period: 600,
					},
				],
			});
			mockUploadWorkerRequest({
				expectedBindings: [],
				useOldUploadApi: true,
				expectedContainers: [{ class_name: "ExampleDurableObject" }],
			});
			mockListDurableObjects([
				{
					id: "something",
					name: "name",
					script: "test-name",
					class: "ExampleDurableObject",
				},
			]);
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
						image: "registry.cloudflare.com/some-account-id/hello:world",
						disk: {
							size: "2GB",
							size_mb: 2000,
						},
						vcpu: 0.0625,
						memory: "256MB",
						memory_mib: 256,
					},
					constraints: {
						tiers: [1, 2],
					},
					durable_objects: {
						namespace_id: "something",
					},
					rollout_active_grace_period: 500,
				},
			]);
			fs.writeFileSync("./Dockerfile", "FROM scratch");
			mockGenerateImageRegistryCredentials();
			mockModifyApplication({
				configuration: {
					image: "registry.cloudflare.com/some-account-id/hello:world",
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
				│   [containers.configuration]
				│
				│
				│  SUCCESS  Modified application my-container (Application ID: abc)
				│
				╰ Applied changes

				"
			`);
		});
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
		vi.mocked(spawn).mockReset();
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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Building image my-container:worker
			Your Worker has access to the following bindings:
			Binding                                            Resource
			env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

			The following containers are available:
			- my-container (<cwd>/Dockerfile)

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
			"
			 ⛅️ wrangler x.x.x
			──────────────────
			Total Upload: xx KiB / gzip: xx KiB
			Your Worker has access to the following bindings:
			Binding                                            Resource
			env.EXAMPLE_DO_BINDING (ExampleDurableObject)      Durable Object

			The following containers are available:
			- my-container (registry.cloudflare.com/hello:world)

			--dry-run: exiting now."
		`);
		expect(cliStd.stdout).toMatchInlineSnapshot(`""`);
	});
});

describe("containers.unsafe configuration", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();

	beforeEach(() => {
		setupCommonMocks();
		fs.writeFileSync(
			"index.js",
			`export class ExampleDurableObject {}; export default{};`
		);
	});

	it("should merge containers.unsafe config into create request", async () => {
		mockGetVersion("Galaxy-Class");
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [
				{
					...DEFAULT_CONTAINER_FROM_REGISTRY,
					unsafe: {
						custom_field: "custom_value",
						nested: { field: "nested_value" },
						configuration: { network: "nested_value" },
					},
				},
			],
		});

		mockGetApplications([]);

		mockCreateApplication({
			name: "my-container",
			max_instances: 10,
			custom_field: "custom_value",
			nested: { field: "nested_value" },
			configuration: {
				// @ts-expect-error - testing with custom unsafe fields
				network: "nested_value",
				image: "registry.cloudflare.com/some-account-id/hello:world",
			},
		});

		await runWrangler("deploy index.js");

		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should merge containers.unsafe config into modify request", async () => {
		mockGetVersion("Galaxy-Class");
		writeWranglerConfig({
			...DEFAULT_DURABLE_OBJECTS,
			containers: [
				{
					...DEFAULT_CONTAINER_FROM_REGISTRY,
					max_instances: 20,
					rollout_step_percentage: 10,
					unsafe: {
						unsafe_field: "unsafe_value",
						configuration: { network: "unsafe_network_value" },
					},
				},
			],
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
					tiers: [1, 2],
				},
				durable_objects: {
					namespace_id: "1",
				},
			},
		]);

		mockModifyApplication({
			max_instances: 20,
			// @ts-expect-error - testing unsafe.containers with custom fields
			unsafe_field: "unsafe_value",
			configuration: {
				image: "registry.cloudflare.com/some-account-id/hello:world",
			},
		});

		mockCreateApplicationRollout({
			description: "Progressive update",
			strategy: "rolling",
			kind: "full_auto",
			step_percentage: 10,
			target_configuration: {
				image: "registry.cloudflare.com/some-account-id/hello:world",
				network: "unsafe_network_value",
			},
		});

		await runWrangler("deploy index.js");

		expect(std.err).toMatchInlineSnapshot(`""`);
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

	// Clear any existing mock state
	vi.mocked(spawn).mockReset();

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
	image: "registry.cloudflare.com/hello:world",
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

function mockListDurableObjects(
	durableObjects: Array<{
		id: string;
		name: string;
		script: string;
		class: string;
	}>
) {
	msw.use(
		http.get(
			"*/accounts/:accountId/workers/durable_objects/namespaces",
			async () => {
				return HttpResponse.json(createFetchResult(durableObjects));
			}
		)
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
			"--load",
			"-t",
			`${containerName}:${tag}`,
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
			`${containerName}:${tag}`,
			"--format",
			"{{ json .RepoDigests }}",
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

function mockDockerImageInspectDigestsWithRepoDigest(
	containerName: string,
	tag: string,
	imageId: string
) {
	return (cmd: string, args: readonly string[]) => {
		expect(cmd).toBe("/usr/bin/docker");
		expect(args).toEqual([
			"image",
			"inspect",
			`${containerName}:${tag}`,
			"--format",
			"{{ json .RepoDigests }}",
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
			// Include account-id in the digest to match the managed registry format
			stdout.emit(
				"data",
				`["${getCloudflareContainerRegistry()}/some-account-id/${containerName}@sha256:three"] ${imageId}`
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
			`${containerName}:${tag}`,
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
		expect(args).toEqual(["image", "rm", `${containerName}:${tag}`]);
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
			`${from}:${tag}`,
			`${getCloudflareContainerRegistry()}/${to}:${tag}`,
		]);
		return defaultChildProcess();
	};
}
