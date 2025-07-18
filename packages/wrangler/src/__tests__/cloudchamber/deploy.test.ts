import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { PassThrough, Writable } from "node:stream";
import {
	getCloudflareContainerRegistry,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import { http, HttpResponse } from "msw";
import { createDeferred } from "../../api/startDevWorker/utils";
import { maybeBuildContainer } from "../../cloudchamber/deploy";
import { clearCachedAccount } from "../../cloudchamber/locations";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
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
import { writeWranglerConfig } from "../helpers/write-wrangler-config";
import { mockAccountV4 as mockContainersAccount } from "./utils";
import type {
	AccountRegistryToken,
	Application,
	ImageRegistryCredentialsConfiguration,
} from "@cloudflare/containers-shared";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process");
describe("maybeBuildContainer", () => {
	it("Should return imageUpdate: true if using an image URI", async () => {
		const config = {
			image: "registry.cloudflare.com/some-image:uri",
			class_name: "Test",
		};
		const result = await maybeBuildContainer(
			config,
			"some-tag:thing",
			false,
			"/usr/bin/docker",
			undefined
		);
		expect(result.image).toEqual(config.image);
		expect(result.imageUpdated).toEqual(true);
	});
});
describe("wrangler deploy with containers", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	mockAccountId();
	mockApiToken();

	beforeEach(() => {
		msw.use(...mswSuccessDeploymentScriptMetadata);
		msw.use(...mswListNewDeploymentsLatestFull);
		fs.writeFileSync(
			"index.js",
			`export class ExampleDurableObject {}; export default{};`
		);
		vi.stubEnv("WRANGLER_DOCKER_BIN", "/usr/bin/docker");

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
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("should fail early if no docker is detected when deploying a container from a dockerfile", async () => {
		vi.stubEnv("WRANGLER_DOCKER_BIN", "/usr/bin/bad-docker-path");
		writeWranglerConfig({
			durable_objects: {
				bindings: [
					{
						name: "EXAMPLE_DO_BINDING",
						class_name: "ExampleDurableObject",
					},
				],
			},
			containers: [
				{
					name: "my-container",
					max_instances: 10,
					class_name: "ExampleDurableObject",
					image: "./Dockerfile",
				},
			],
			migrations: [{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] }],
		});

		fs.writeFileSync("./Dockerfile", "FROM scratch");

		await expect(runWrangler("deploy index.js")).rejects
			.toThrowErrorMatchingInlineSnapshot(`
						[Error: The Docker CLI could not be launched. Please ensure that the Docker CLI is installed and the daemon is running.
						Other container tooling that is compatible with the Docker CLI and engine may work, but is not yet guaranteed to do so. You can specify an executable with the environment variable WRANGLER_DOCKER_BIN and a socket with WRANGLER_DOCKER_HOST.]
					`);
	});

	it("should support durable object bindings to SQLite classes with containers (dockerfile flow)", async () => {
		mockGetVersion("Galaxy-Class");

		vi.mocked(spawn)
			.mockImplementationOnce(mockDockerInfo())
			.mockImplementationOnce(
				mockDockerBuild("my-container", "Galaxy", "FROM scratch", process.cwd())
			)
			.mockImplementationOnce(mockDockerImageInspect("my-container", "Galaxy"))
			.mockImplementationOnce(mockDockerLogin("mockpassword"))
			.mockImplementationOnce(
				mockDockerManifestInspect("some-account-id/my-container", true)
			)
			.mockImplementationOnce(
				mockDockerTag("my-container", "some-account-id/my-container", "Galaxy")
			)
			.mockImplementationOnce(
				mockDockerPush("some-account-id/my-container", "Galaxy")
			)
			.mockImplementationOnce(
				mockDockerImageDelete("some-account-id/my-container", "Galaxy")
			);

		writeWranglerConfig({
			durable_objects: {
				bindings: [
					{
						name: "EXAMPLE_DO_BINDING",
						class_name: "ExampleDurableObject",
					},
				],
			},
			containers: [
				{
					name: "my-container",
					max_instances: 10,
					class_name: "ExampleDurableObject",
					image: "./Dockerfile",
				},
			],
			migrations: [{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] }],
		});

		mockGetApplications([]);
		fs.writeFileSync("./Dockerfile", "FROM scratch");
		mockGenerateImageRegistryCredentials();

		mockCreateApplication({
			name: "my-container",
			max_instances: 10,
			durable_objects: { namespace_id: "1" },
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
	});

	it("should support durable object bindings to SQLite classes with containers (image uri flow)", async () => {
		// note no docker commands have been mocked here!
		mockGetVersion("Galaxy-Class");

		writeWranglerConfig({
			durable_objects: {
				bindings: [
					{
						name: "EXAMPLE_DO_BINDING",
						class_name: "ExampleDurableObject",
					},
				],
			},
			containers: [
				{
					image: "docker.io/hello:world",
					name: "my-container",
					max_instances: 10,
					class_name: "ExampleDurableObject",
				},
			],
			migrations: [{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] }],
		});

		mockGetApplications([]);

		mockCreateApplication({
			name: "my-container",
			max_instances: 10,
			durable_objects: { namespace_id: "1" },
			scheduling_policy: SchedulingPolicy.DEFAULT,
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
	});

	it("resolve the docker build context path based on the dockerfile location, if image_build_context is not provided", async () => {
		vi.stubEnv("WRANGLER_DOCKER_BIN", "/usr/bin/docker");
		mockGetVersion("Galaxy-Class");

		vi.mocked(spawn)
			.mockImplementationOnce(mockDockerInfo())
			.mockImplementationOnce(
				mockDockerBuild(
					"my-container",
					"Galaxy",
					"FROM scratch",
					// note that the cwd for the test is not the same as the cwd that the wrangler command is running in
					// fortunately we are using an absolute path
					process.cwd()
				)
			)
			.mockImplementationOnce(mockDockerImageInspect("my-container", "Galaxy"))
			.mockImplementationOnce(mockDockerLogin("mockpassword"))
			.mockImplementationOnce(
				mockDockerManifestInspect("some-account-id/my-container", true)
			)
			.mockImplementationOnce(
				mockDockerTag("my-container", "some-account-id/my-container", "Galaxy")
			)
			.mockImplementationOnce(
				mockDockerPush("some-account-id/my-container", "Galaxy")
			)
			.mockImplementationOnce(
				mockDockerImageDelete("some-account-id/my-container", "Galaxy")
			);

		mockContainersAccount();

		writeWranglerConfig(
			{
				main: "./worker/index.js",
				durable_objects: {
					bindings: [
						{
							name: "EXAMPLE_DO_BINDING",
							class_name: "ExampleDurableObject",
						},
					],
				},
				containers: [
					{
						name: "my-container",
						max_instances: 10,
						class_name: "ExampleDurableObject",
						image: "../Dockerfile",
					},
				],
				migrations: [
					{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] },
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
			durable_objects: { namespace_id: "1" },
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

	it("resolve the dockerfile based on the non-redirected userConfigPath rather than the actual config path", async () => {
		vi.stubEnv("WRANGLER_DOCKER_BIN", "/usr/bin/docker");
		mockGetVersion("Galaxy-Class");

		vi.mocked(spawn)
			.mockImplementationOnce(mockDockerInfo())
			.mockImplementationOnce(
				mockDockerBuild(
					"my-container",
					"Galaxy",
					"FROM scratch",
					// note that the cwd for the test is not the same as the cwd that the wrangler command is running in
					// fortunately we are using an absolute path
					process.cwd()
				)
			)
			.mockImplementationOnce(mockDockerImageInspect("my-container", "Galaxy"))
			.mockImplementationOnce(mockDockerLogin("mockpassword"))
			.mockImplementationOnce(
				mockDockerManifestInspect("some-account-id/my-container", true)
			)
			.mockImplementationOnce(
				mockDockerTag("my-container", "some-account-id/my-container", "Galaxy")
			)
			.mockImplementationOnce(
				mockDockerPush("some-account-id/my-container", "Galaxy")
			)
			.mockImplementationOnce(
				mockDockerImageDelete("some-account-id/my-container", "Galaxy")
			);

		mockContainersAccount();

		const wranglerConfig = {
			main: "index.js",
			durable_objects: {
				bindings: [
					{
						name: "EXAMPLE_DO_BINDING",
						class_name: "ExampleDurableObject",
					},
				],
			},
			containers: [
				{
					name: "my-container",
					max_instances: 10,
					class_name: "ExampleDurableObject",
					image: "./Dockerfile",
				},
			],
			migrations: [{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] }],
		};
		// user wrangler config
		writeWranglerConfig(wranglerConfig, "./wrangler.json");
		// set up redirected config
		fs.mkdirSync(".wrangler/deploy", { recursive: true });
		fs.writeFileSync(
			".wrangler/deploy/config.json",
			JSON.stringify({ configPath: "./wrangler.json" })
		);
		writeWranglerConfig(
			{ ...wranglerConfig, main: "../../index.js" },
			".wrangler/deploy/wrangler.json"
		);
		// dockerfile is in the root of the project
		fs.writeFileSync("Dockerfile", "FROM scratch");
		mockGetApplications([]);

		mockGenerateImageRegistryCredentials();

		mockCreateApplication({
			name: "my-container",
			max_instances: 10,
			durable_objects: { namespace_id: "1" },
			configuration: {
				image:
					getCloudflareContainerRegistry() +
					"/some-account-id/my-container:Galaxy",
			},
		});

		await runWrangler("deploy");
		expect(std.info).toMatchInlineSnapshot(`
			"Using redirected Wrangler configuration.
			 - Configuration being used: \\".wrangler/deploy/wrangler.json\\"
			 - Original user's configuration: \\"wrangler.json\\"
			 - Deploy configuration file: \\".wrangler/deploy/config.json\\""
		`);
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
	it("should support deploying a worker with multiple containers", async () => {
		mockGetVersion(
			"Galaxy-Class",
			[
				{
					type: "durable_object_namespace",
					class_name: "ExampleDurableObjectA",
					namespace_id: "a",
				},
				{
					type: "durable_object_namespace",
					class_name: "ExampleDurableObjectB",
					namespace_id: "b",
				},
			],
			false
		);
		vi.mocked(spawn)
			.mockImplementationOnce(mockDockerInfo())
			.mockImplementationOnce(
				mockDockerBuild(
					"my-container-a",
					"Galaxy",
					// we pipe the dockerfile in, so a successful test should just show that the dockerfile content has been successfully read and matches what was written (FROM alpine)
					"FROM alpine",
					// note that the cwd for the test is not the same as the cwd that the wrangler command is running in
					// fortunately we are using an absolute path
					process.cwd()
				)
			)
			.mockImplementationOnce(
				mockDockerImageInspect("my-container-a", "Galaxy")
			)
			.mockImplementationOnce(mockDockerLogin("mockpassword"))
			.mockImplementationOnce(
				mockDockerManifestInspect("some-account-id/my-container-a", true)
			)
			.mockImplementationOnce(
				mockDockerTag(
					"my-container-a",
					"some-account-id/my-container-a",
					"Galaxy"
				)
			)
			.mockImplementationOnce(
				mockDockerPush("some-account-id/my-container-a", "Galaxy")
			)
			.mockImplementationOnce(
				mockDockerImageDelete("some-account-id/my-container-a", "Galaxy")
			)
			.mockImplementationOnce(
				mockDockerBuild(
					"my-container-b",
					"Galaxy",
					// we pipe the dockerfile in, so a successful test should just show that the dockerfile content has been successfully read and matches what was written (FROM alpine)
					"FROM alpine",
					// note that the cwd for the test is not the same as the cwd that the wrangler command is running in
					// fortunately we are using an absolute path
					process.cwd()
				)
			)
			.mockImplementationOnce(
				mockDockerImageInspect("my-container-b", "Galaxy")
			)
			.mockImplementationOnce(mockDockerLogin("mockpassword"))
			.mockImplementationOnce(
				mockDockerManifestInspect("some-account-id/my-container-b", true)
			)
			.mockImplementationOnce(
				mockDockerTag(
					"my-container-b",
					"some-account-id/my-container-b",
					"Galaxy"
				)
			)
			.mockImplementationOnce(
				mockDockerPush("some-account-id/my-container-b", "Galaxy")
			)
			.mockImplementationOnce(
				mockDockerImageDelete("some-account-id/my-container-b", "Galaxy")
			);
		fs.mkdirSync("src");
		fs.writeFileSync("DockerfileA", "FROM alpine");
		fs.writeFileSync("DockerfileB", "FROM alpine");
		fs.writeFileSync(
			"src/index.js",
			`
			export class ExampleDurableObjectA {};
			export class ExampleDurableObjectB {};
			export default{};
			`
		);
		writeWranglerConfig(
			{
				main: "./src/index.js",
				durable_objects: {
					bindings: [
						{
							name: "EXAMPLE_DO_BINDING_A",
							class_name: "ExampleDurableObjectA",
						},
						{
							name: "EXAMPLE_DO_BINDING_B",
							class_name: "ExampleDurableObjectB",
						},
					],
				},
				containers: [
					{
						name: "my-container-a",
						max_instances: 10,
						class_name: "ExampleDurableObjectA",
						image: "./DockerfileA",
					},
					{
						name: "my-container-b",
						max_instances: 10,
						class_name: "ExampleDurableObjectB",
						image: "./DockerfileB",
					},
				],
				migrations: [
					{ tag: "v1", new_sqlite_classes: ["ExampleDurableObjectA"] },
					{ tag: "v1", new_sqlite_classes: ["ExampleDurableObjectB"] },
				],
			},
			"wrangler.json"
		);
		mockUploadWorkerRequest({
			expectedBindings: [
				{
					class_name: "ExampleDurableObjectA",
					name: "EXAMPLE_DO_BINDING_A",
					type: "durable_object_namespace",
				},
				{
					class_name: "ExampleDurableObjectB",
					name: "EXAMPLE_DO_BINDING_B",
					type: "durable_object_namespace",
				},
			],
			useOldUploadApi: true,
			expectedContainers: [
				{ class_name: "ExampleDurableObjectA" },
				{ class_name: "ExampleDurableObjectB" },
			],
		});
		mockGetApplications([], false);
		mockGenerateImageRegistryCredentials(false);
		const applicationACreatedJson = createDeferred<Record<string, unknown>>();
		const applicationBCreatedJson = createDeferred<Record<string, unknown>>();
		mockCreateApplication((requestJson) => {
			if (requestJson.name === "my-container-a") {
				return applicationACreatedJson.resolve(requestJson);
			}
			if (requestJson.name === "my-container-b") {
				return applicationBCreatedJson.resolve(requestJson);
			}
			throw new Error("Unexpected request made");
		}, false);
		await runWrangler("deploy");
		vi.mocked(spawn).mockReset();
		const applicationA = await applicationACreatedJson.promise;
		expect(applicationA.name).toEqual("my-container-a");
		expect(applicationA.durable_objects).toEqual({ namespace_id: "a" });
		const applicationB = await applicationBCreatedJson.promise;
		expect(applicationB.name).toEqual("my-container-b");
		expect(applicationB.durable_objects).toEqual({ namespace_id: "b" });
		expect(std.out).toMatchInlineSnapshot(`
			"Total Upload: xx KiB / gzip: xx KiB
			Worker Startup Time: 100 ms
			Your Worker has access to the following bindings:
			Binding                                               Resource
			env.EXAMPLE_DO_BINDING_A (ExampleDurableObjectA)      Durable Object
			env.EXAMPLE_DO_BINDING_B (ExampleDurableObjectB)      Durable Object

			Uploaded test-name (TIMINGS)
			Building image my-container-a:Galaxy
			Image does not exist remotely, pushing: registry.cloudflare.com/some-account-id/my-container-a:Galaxy
			Building image my-container-b:Galaxy
			Image does not exist remotely, pushing: registry.cloudflare.com/some-account-id/my-container-b:Galaxy
			Deployed test-name triggers (TIMINGS)
			  https://test-name.test-sub-domain.workers.dev
			Current Version ID: Galaxy-Class"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
	});

	it("should resolve dockerfile path relative to wrangler config path", async () => {
		mockGetVersion("Galaxy-Class");
		vi.mocked(spawn)
			.mockImplementationOnce(mockDockerInfo())
			.mockImplementationOnce(
				mockDockerBuild(
					"my-container",
					"Galaxy",
					// we pipe the dockerfile in, so a successful test should just show that the dockerfile content has been successfully read and matches what was written (FROM alpine)
					"FROM alpine",
					// note that the cwd for the test is not the same as the cwd that the wrangler command is running in
					// fortunately we are using an absolute path
					process.cwd()
				)
			)
			.mockImplementationOnce(mockDockerImageInspect("my-container", "Galaxy"))
			.mockImplementationOnce(mockDockerLogin("mockpassword"))
			.mockImplementationOnce(
				mockDockerManifestInspect("some-account-id/my-container", true)
			)
			.mockImplementationOnce(
				mockDockerTag("my-container", "some-account-id/my-container", "Galaxy")
			)
			.mockImplementationOnce(
				mockDockerPush("some-account-id/my-container", "Galaxy")
			)
			.mockImplementationOnce(
				mockDockerImageDelete("some-account-id/my-container", "Galaxy")
			);

		fs.mkdirSync("nested/src", { recursive: true });
		fs.writeFileSync("Dockerfile", "FROM alpine");
		fs.writeFileSync(
			"nested/src/index.js",
			`export class ExampleDurableObject {}; export default{};`
		);

		writeWranglerConfig(
			{
				main: "./src/index.js",
				durable_objects: {
					bindings: [
						{
							name: "EXAMPLE_DO_BINDING",
							class_name: "ExampleDurableObject",
						},
					],
				},
				containers: [
					{
						name: "my-container",
						max_instances: 10,
						class_name: "ExampleDurableObject",
						image: "../Dockerfile",
					},
				],
				migrations: [
					{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] },
				],
			},
			"nested/wrangler.json"
		);

		mockGetApplications([]);
		mockGenerateImageRegistryCredentials();

		mockCreateApplication({
			name: "my-container",
			max_instances: 10,
			durable_objects: { namespace_id: "1" },
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

	it("should error when no scope for containers", async () => {
		mockContainersAccount([]);
		writeWranglerConfig({
			durable_objects: {
				bindings: [
					{
						name: "EXAMPLE_DO_BINDING",
						class_name: "ExampleDurableObject",
					},
				],
			},
			containers: [
				{
					image: "docker.io/hello:world",
					name: "my-container",
					max_instances: 10,
					class_name: "ExampleDurableObject",
				},
			],
			migrations: [{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] }],
		});

		await expect(
			runWrangler("deploy index.js")
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: You need 'containers:write', try logging in again or creating an appropiate API token]`
		);
	});
});

// This is a separate describe block because we intentionally do not mock any
// API tokens, account ID, or authorization. The purpose of these tests is to
// ensure that --dry-run mode works without requiring any API access.
describe("wrangler deploy with containers dry run", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	beforeEach(() => {
		clearCachedAccount();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("builds the image without pushing", async () => {
		vi.mocked(spawn)
			.mockImplementationOnce(mockDockerInfo())
			.mockImplementationOnce(
				mockDockerBuild("my-container", "worker", "FROM scratch", process.cwd())
			)
			.mockImplementationOnce(mockDockerImageInspect("my-container", "worker"))
			.mockImplementationOnce(mockDockerLogin("mockpassword"))
			.mockImplementationOnce(mockDockerManifestInspect("my-container", true))
			.mockImplementationOnce(mockDockerPush("my-container", "worker"));

		vi.stubEnv("WRANGLER_DOCKER_BIN", "/usr/bin/docker");

		fs.writeFileSync("Dockerfile", "FROM scratch");
		fs.writeFileSync(
			"index.js",
			`export class ExampleDurableObject {}; export default{};`
		);

		writeWranglerConfig({
			durable_objects: {
				bindings: [
					{
						name: "EXAMPLE_DO_BINDING",
						class_name: "ExampleDurableObject",
					},
				],
			},
			containers: [
				{
					image: "./Dockerfile",
					name: "my-container",
					max_instances: 10,
					class_name: "ExampleDurableObject",
				},
			],
			migrations: [{ tag: "v1", new_sqlite_classes: ["ExampleDurableObject"] }],
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
	});
});

function mockGetVersion(versionId: string, bindings?: unknown[], once = true) {
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
							bindings: bindings ?? [
								{
									type: "durable_object_namespace",
									namespace_id: "1",
									class_name: "ExampleDurableObject",
								},
							],
						},
					})
				);
			},
			{ once }
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

function mockCreateApplication(
	expectedOrCallback?:
		| Partial<Application>
		| ((requestJson: Record<string, unknown>) => void),
	once = true
) {
	msw.use(
		http.post(
			"*/applications",
			async ({ request }) => {
				const json = await request.json();
				if (expectedOrCallback !== undefined) {
					if (typeof expectedOrCallback === "function") {
						const callback = expectedOrCallback;
						callback(json as Record<string, unknown>);
					} else {
						const expected = expectedOrCallback;
						expect(json).toMatchObject(expected);
					}
				}

				return HttpResponse.json({ success: true, result: json });
			},
			{ once }
		)
	);
}

function mockGenerateImageRegistryCredentials(once = true) {
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
			{ once }
		)
	);
}
function mockGetApplications(applications: Application[], once = true) {
	msw.use(
		http.get(
			"*/applications",
			async () => {
				return HttpResponse.json({ success: true, result: applications });
			},
			{ once }
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

function mockDockerImageInspect(containerName: string, tag: string) {
	return (cmd: string, args: readonly string[]) => {
		expect(cmd).toBe("/usr/bin/docker");
		expect(args).toEqual([
			"image",
			"inspect",
			`${getCloudflareContainerRegistry()}/${containerName}:${tag}`,
			"--format",
			"{{ .Size }} {{ len .RootFS.Layers }} {{json .RepoDigests}}",
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
				`123456 4 ["${getCloudflareContainerRegistry()}/${containerName}@sha256:three"]`
			);
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

function mockDockerManifestInspect(containerName: string, shouldFail = true) {
	return (cmd: string, args: readonly string[]) => {
		expect(cmd).toBe("/usr/bin/docker");
		expect(args[0]).toBe("manifest");
		expect(args[1]).toBe("inspect");
		expect(args[2]).toEqual(`${containerName}@three`);
		expect(args).toEqual([
			"manifest",
			"inspect",
			`${getCloudflareContainerRegistry()}/${containerName}@three`,
		]);
		const readable = new Writable({
			write() {},
			final() {},
		});
		return {
			stdout: Buffer.from(
				"i promise I am an unsuccessful docker manifest call"
			),
			stdin: readable,
			on: function (reason: string, cbPassed: (code: number) => unknown) {
				if (reason === "close") {
					cbPassed(shouldFail ? 1 : 0);
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
