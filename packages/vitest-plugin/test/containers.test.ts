import { EventEmitter } from "node:events";
import {
	createContainerDevPlan,
	generateContainerBuildId,
	isCloudflareRegistryImage,
	prepareContainerImagesForDev,
	resolveDockerHost,
} from "@cloudflare/containers-shared";
import { getDockerPath } from "@cloudflare/workers-utils/docker-path";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	beginContainerConfiguration,
	cancelContainerPreparationOnProcessExit,
	prepareProjectContainers,
} from "../src/pool/containers";
import type {
	ContainerDevOptions,
	ViteLogger,
} from "@cloudflare/containers-shared";
import type { Config } from "@cloudflare/workers-utils";
import type { TestProject } from "vitest/node";

vi.mock("@cloudflare/containers-shared", () => ({
	createContainerDevPlan: vi.fn(),
	generateContainerBuildId: vi.fn(),
	isCloudflareRegistryImage: vi.fn(),
	prepareContainerImagesForDev: vi.fn(),
	resolveDockerHost: vi.fn(),
}));
vi.mock("@cloudflare/workers-utils/docker-path", () => ({
	getDockerPath: vi.fn(),
}));

const CONFIG_PATH = "/project/wrangler.jsonc";

function getConfig(
	container: NonNullable<Config["containers"]>[number]
): Config {
	return {
		containers: [{ name: "container", ...container }],
		dev: { enable_containers: true },
		exports: {},
	} as Config;
}

const config = getConfig({
	class_name: "Container",
	image: "/project/Dockerfile",
});
const logger: ViteLogger = {
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};

function getContainerOptions(
	containerBuildId = "build-id",
	dockerfile = "/project/Dockerfile"
): ContainerDevOptions[] {
	return [
		{
			class_name: "Container",
			dockerfile,
			image_build_context: "/project",
			image_tag: `cloudflare-dev/container:${containerBuildId}`,
		},
	];
}

function createProject(name = "test-project"): {
	project: TestProject;
	close: () => void;
	emitFileEvent: (event: string, filePath: string) => void;
	onRerun: ReturnType<typeof vi.fn>;
} {
	let close = () => {};
	const fileWatcher = new EventEmitter();
	Object.assign(fileWatcher, { add: vi.fn() });
	const forceRerunTriggers: string[] = [];
	const invalidates = new Set<string>();
	const onRerun = vi.fn();
	// Vitest's unlink listener runs first and records the path as invalidated.
	// Its change handler ignores paths already present in this set.
	fileWatcher.on("unlink", (filePath: string) => invalidates.add(filePath));
	const onFileChange = vi.fn((filePath: string) => {
		if (!invalidates.has(filePath) && forceRerunTriggers.includes(filePath)) {
			onRerun(filePath);
		}
	});
	const vitest = {
		config: { forceRerunTriggers },
		onClose(handler: () => void) {
			close = handler;
		},
		vite: { watcher: fileWatcher },
		watcher: { invalidates, onFileChange },
	};
	return {
		project: { name, vitest } as unknown as TestProject,
		close: () => close(),
		emitFileEvent: (event, filePath) => fileWatcher.emit(event, filePath),
		onRerun,
	};
}

function mockPlan(options?: ContainerDevOptions[]): void {
	vi.mocked(createContainerDevPlan).mockImplementation(
		({ containerBuildId }) => {
			const containerOptions = options ?? getContainerOptions(containerBuildId);
			const firstOption = containerOptions[0];
			return {
				containerOptions,
				containerRuntimeOptions: new Map([
					[
						"Container",
						firstOption === undefined
							? {}
							: { imageName: firstOption.image_tag },
					],
				]),
			};
		}
	);
}

function mockRegistryPlan(imageUri: string): void {
	mockPlan([
		{
			class_name: "Container",
			image_uri: imageUri,
			image_tag: "cloudflare-dev/container:build-id",
		},
	]);
}

function mockPendingPreparation(): {
	abort: ReturnType<typeof vi.fn>;
	complete: () => void;
} {
	let complete: () => void = () => {
		throw new Error("Container image preparation has not started");
	};
	let aborted = false;
	const abort = vi.fn(() => {
		aborted = true;
	});
	vi.mocked(prepareContainerImagesForDev).mockImplementation(
		(options) =>
			new Promise((resolve) => {
				complete = () => {
					const containerOptions = options.containerOptions[0];
					options.onContainerImagePreparationStart({
						containerOptions,
						abort,
					});
					queueMicrotask(() => {
						options.onContainerImagePreparationEnd({ containerOptions });
						resolve({ aborted });
					});
				};
			})
	);
	return { abort, complete: () => complete() };
}

describe("project Container environments", () => {
	let project: TestProject;
	let closeVitest: () => void;
	let emitFileEvent: ReturnType<typeof createProject>["emitFileEvent"];
	let onRerun: ReturnType<typeof createProject>["onRerun"];

	beforeEach(() => {
		({ project, close: closeVitest, emitFileEvent, onRerun } = createProject());
		mockPlan();
		vi.mocked(generateContainerBuildId).mockReturnValue("build-id");
		vi.mocked(getDockerPath).mockReturnValue("docker");
		vi.mocked(isCloudflareRegistryImage).mockReturnValue(false);
		vi.mocked(resolveDockerHost).mockReturnValue("unix:///docker.sock");
		vi.mocked(prepareContainerImagesForDev).mockResolvedValue({
			aborted: false,
		});
	});

	afterEach(() => {
		cancelContainerPreparationOnProcessExit();
		vi.clearAllMocks();
	});

	function prepare(workerConfig = config) {
		return prepareProjectContainers(project, workerConfig, CONFIG_PATH, logger);
	}

	it("drops cached environments when Containers are disabled", async ({
		expect,
	}) => {
		await prepare();

		await expect(
			prepare({
				...config,
				dev: { ...config.dev, enable_containers: false },
			})
		).resolves.toBeUndefined();
		emitFileEvent("change", "/project/container/app.js");
		expect(onRerun).not.toHaveBeenCalled();
		expect(createContainerDevPlan).toHaveBeenCalledOnce();
		expect(getDockerPath).toHaveBeenCalledOnce();

		await prepare();
		expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(2);
	});

	it("shares preparation and returns its runtime options", async ({
		expect,
	}) => {
		const [first, second] = await Promise.all([prepare(), prepare()]);

		const environment = {
			containerBuildId: "build-id",
			containerEngine: "unix:///docker.sock",
		};
		expect(first).toEqual(environment);
		expect(second).toEqual(environment);
		expect(createContainerDevPlan).toHaveBeenLastCalledWith({
			containers: config.containers,
			exports: config.exports,
			containerBuildId: "build-id",
			configPath: CONFIG_PATH,
		});
		expect(resolveDockerHost).toHaveBeenCalledWith("docker");
		expect(prepareContainerImagesForDev).toHaveBeenCalledWith({
			dockerPath: "docker",
			containerOptions: getContainerOptions(),
			onContainerImagePreparationStart: expect.any(Function),
			onContainerImagePreparationEnd: expect.any(Function),
			logger,
			complianceConfig: config,
		});
		expect(prepareContainerImagesForDev).toHaveBeenCalledOnce();
	});

	it("keeps project environments independent", async ({ expect }) => {
		const otherProject = {
			name: "other-project",
			vitest: project.vitest,
		} as unknown as TestProject;
		vi.mocked(generateContainerBuildId)
			.mockReturnValueOnce("first-build")
			.mockReturnValueOnce("second-build");

		await Promise.all([
			prepare(),
			prepareProjectContainers(otherProject, config, CONFIG_PATH, logger),
		]);
		expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(2);

		closeVitest();
		emitFileEvent("change", "/project/container/app.js");
		expect(onRerun).not.toHaveBeenCalled();
	});

	it("prepares runtime dependencies for plans without images", async ({
		expect,
	}) => {
		const workerConfig = getConfig({
			name: "managed-container",
			class_name: "Container",
			scheduling_policy: "durable_object",
		});
		mockPlan([]);

		await prepare(workerConfig);

		expect(prepareContainerImagesForDev).toHaveBeenCalledWith(
			expect.objectContaining({ containerOptions: [] })
		);
	});

	it("replaces environments when Container config changes", async ({
		expect,
	}) => {
		vi.mocked(generateContainerBuildId)
			.mockReturnValueOnce("first-build")
			.mockReturnValueOnce("second-build");

		await prepare();
		mockPlan(getContainerOptions("second-build", "/project/ChangedDockerfile"));
		await expect(
			prepare(
				getConfig({
					class_name: "Container",
					image: "/project/ChangedDockerfile",
				})
			)
		).resolves.toMatchObject({ containerBuildId: "second-build" });

		expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(2);
	});

	it("rebuilds after a Docker build-context file changes", async ({
		expect,
	}) => {
		vi.mocked(generateContainerBuildId)
			.mockReturnValueOnce("first-build")
			.mockReturnValueOnce("second-build");

		await prepare();
		emitFileEvent("change", "/project-other/container/app.js");
		expect(onRerun).not.toHaveBeenCalled();
		emitFileEvent("change", "/project/container/app.js");

		expect(onRerun).toHaveBeenCalledWith("/project/container/app.js");
		await expect(prepare()).resolves.toMatchObject({
			containerBuildId: "second-build",
		});
		expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(2);
	});

	it("rebuilds after a deleted Dockerfile is restored", async ({ expect }) => {
		vi.mocked(generateContainerBuildId)
			.mockReturnValueOnce("first-build")
			.mockReturnValueOnce("missing-build")
			.mockReturnValueOnce("restored-build");
		mockPlan(getContainerOptions("build-id", "/docker/Dockerfile"));

		await prepare();
		emitFileEvent("unlink", "/docker/Dockerfile");
		vi.mocked(prepareContainerImagesForDev).mockRejectedValueOnce(
			new Error("Dockerfile is missing")
		);
		await expect(prepare()).rejects.toThrow("Dockerfile is missing");

		emitFileEvent("add", "/docker/Dockerfile");
		await expect(prepare()).resolves.toMatchObject({
			containerBuildId: "restored-build",
		});
		expect(onRerun).toHaveBeenCalledTimes(2);
		expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(3);
	});

	it("adds project context and retries preparation failures", async ({
		expect,
	}) => {
		vi.mocked(prepareContainerImagesForDev)
			.mockRejectedValueOnce(new Error("Docker unavailable"))
			.mockResolvedValueOnce({ aborted: false });

		await expect(prepare()).rejects.toThrow(
			'Unable to prepare Containers for Vitest project "test-project".\n\nDocker unavailable'
		);
		await expect(prepare()).resolves.toMatchObject({
			containerBuildId: "build-id",
		});
		expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(2);
	});

	it.for([
		{ timing: "before image preparation starts", startBeforeClose: false },
		{ timing: "after image preparation starts", startBeforeClose: true },
	])(
		"aborts when shutdown begins $timing",
		async ({ startBeforeClose }, { expect }) => {
			const preparationControl = mockPendingPreparation();
			const preparation = prepare();
			await vi.waitFor(() =>
				expect(prepareContainerImagesForDev).toHaveBeenCalledOnce()
			);

			if (startBeforeClose) {
				preparationControl.complete();
			}
			closeVitest();
			if (!startBeforeClose) {
				preparationControl.complete();
			}

			await expect(preparation).rejects.toThrow(
				"Container image preparation was aborted"
			);
			expect(preparationControl.abort).toHaveBeenCalledOnce();
		}
	);

	it("does not start preparation after an early shutdown", async ({
		expect,
	}) => {
		beginContainerConfiguration(project.vitest);
		closeVitest();

		await expect(prepare()).rejects.toThrow(
			"Container image preparation was aborted"
		);
		expect(createContainerDevPlan).not.toHaveBeenCalled();
		expect(getDockerPath).not.toHaveBeenCalled();
	});

	it("prepares after a Vitest config restart", async ({ expect }) => {
		await prepare();
		closeVitest();
		emitFileEvent("change", "/project/container/app.js");
		expect(onRerun).not.toHaveBeenCalled();

		beginContainerConfiguration(project.vitest);

		await expect(prepare()).resolves.toMatchObject({
			containerBuildId: "build-id",
		});
		expect(prepareContainerImagesForDev).toHaveBeenCalledTimes(2);
	});

	it.for([
		{
			name: "prepares external registry images",
			imageUri: "registry.example.com/account/image:tag",
			managed: false,
		},
		{
			name: "rejects Cloudflare-managed registry images",
			imageUri: "registry.cloudflare.com/account/image:tag",
			managed: true,
		},
	])("$name", async ({ imageUri, managed }, { expect }) => {
		const workerConfig = getConfig({
			class_name: "Container",
			image: imageUri,
		});
		mockRegistryPlan(imageUri);
		vi.mocked(isCloudflareRegistryImage).mockReturnValue(managed);

		const preparation = prepare(workerConfig);
		if (managed) {
			await expect(preparation).rejects.toThrow(
				"not yet supported by the Vitest plugin"
			);
			expect(prepareContainerImagesForDev).not.toHaveBeenCalled();
		} else {
			await expect(preparation).resolves.toBeDefined();
			expect(prepareContainerImagesForDev).toHaveBeenCalledOnce();
		}
		expect(isCloudflareRegistryImage).toHaveBeenCalledWith(
			imageUri,
			workerConfig
		);
	});

	it("cancels preparation during process exit", async ({ expect }) => {
		const preparationControl = mockPendingPreparation();
		const preparation = prepare();
		await vi.waitFor(() =>
			expect(prepareContainerImagesForDev).toHaveBeenCalledOnce()
		);

		cancelContainerPreparationOnProcessExit();
		preparationControl.complete();

		await expect(preparation).rejects.toThrow(
			"Container image preparation was aborted"
		);
		expect(preparationControl.abort).toHaveBeenCalledOnce();
	});
});
