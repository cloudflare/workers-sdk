import {
	apply,
	cleanupBuiltContainerImages,
	initContainersSharedContext,
	listDurableObjects,
	OpenAPI,
	pushBuiltContainerImage,
	SchedulingPolicy,
} from "@cloudflare/containers-shared";
import { defaultWranglerConfig } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { initDeployHelpersContext } from "../src";
import { preview } from "../src/preview/preview";
import type { WorkerBuildResult } from "../src/shared/types";
import type {
	BuiltContainerDeployment,
	ContainerNormalizedConfig,
	SharedContainerConfig,
} from "@cloudflare/containers-shared";
import type { Config } from "@cloudflare/workers-utils";

const mockPreviewApi = vi.hoisted(() => ({
	createPreview: vi.fn(),
	createPreviewDeployment: vi.fn(),
	createPreviewParentWorker: vi.fn(),
	deletePreview: vi.fn(),
	editPreview: vi.fn(),
	getPreview: vi.fn(),
	getPreviewDeployment: vi.fn(),
	getWorkerPreviewDefaults: vi.fn(),
}));

vi.mock("@cloudflare/containers-shared", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/containers-shared")>()),
	apply: vi.fn(),
	cleanupBuiltContainerImages: vi.fn(),
	initContainersSharedContext: vi.fn(),
	listDurableObjects: vi.fn(),
	pushBuiltContainerImage: vi.fn(),
}));

vi.mock("../src/preview/api", () => ({
	...mockPreviewApi,
}));

const ACCOUNT_ID = "some-account-id";
const PREVIEW_ID = "preview-id";
const DEPLOYMENT_ID = "deployment-id";
const PREVIEW_APP_NAME = "test-worker_my-feature_MyContainer";

const previewResource = {
	id: PREVIEW_ID,
	name: "my-feature",
	slug: "my-feature",
	worker_name: "test-worker",
	urls: [],
};

const deploymentResource = {
	id: DEPLOYMENT_ID,
	preview_id: PREVIEW_ID,
	preview_name: "my-feature",
	env: {
		MY_CONTAINER: {
			type: "durable_object_namespace",
			class_name: "MyContainer",
			namespace_id: "preview-do-ns-id",
		},
	},
	urls: [],
};

function containerConfig(
	overrides: Partial<SharedContainerConfig> = {}
): ContainerNormalizedConfig {
	return {
		name: PREVIEW_APP_NAME,
		class_name: "MyContainer",
		max_instances: 0,
		scheduling_policy: SchedulingPolicy.DEFAULT,
		rollout_step_percentage: [90, 10],
		rollout_kind: "full_auto",
		rollout_active_grace_period: 0,
		constraints: {},
		instance_type: "dev",
		dockerfile: "/abs/path/Dockerfile",
		image_build_context: "/abs/path",
		...overrides,
	} as ContainerNormalizedConfig;
}

function builtDeploymentFor(
	container: ContainerNormalizedConfig
): BuiltContainerDeployment {
	return {
		container: container as BuiltContainerDeployment["container"],
		builtImage: {
			containerConfig:
				container as BuiltContainerDeployment["builtImage"]["containerConfig"],
			localTag: "preview:temp",
		},
	};
}

const config = {
	...defaultWranglerConfig,
	name: "test-worker",
	compatibility_date: "2025-01-01",
	durable_objects: { bindings: [] },
	migrations: [],
} as unknown as Config;

const buildResult: WorkerBuildResult = {
	modules: [],
	sourceMaps: undefined,
	dependencies: {},
	resolvedEntryPointPath: "index.js",
	bundleType: "esm",
	content: "export default {};",
};

describe("preview containers", () => {
	beforeEach(() => {
		OpenAPI.LOGGER = undefined;
		vi.mocked(apply).mockReset();
		vi.mocked(cleanupBuiltContainerImages).mockReset();
		vi.mocked(cleanupBuiltContainerImages).mockResolvedValue(undefined);
		vi.mocked(initContainersSharedContext).mockReset();
		vi.mocked(listDurableObjects).mockReset();
		vi.mocked(listDurableObjects).mockResolvedValue([]);
		vi.mocked(pushBuiltContainerImage).mockReset();
		vi.mocked(pushBuiltContainerImage).mockResolvedValue({
			newTag: "built:tag",
		});
		mockPreviewApi.createPreview.mockReset();
		mockPreviewApi.createPreview.mockResolvedValue(previewResource);
		mockPreviewApi.createPreviewDeployment.mockReset();
		mockPreviewApi.createPreviewDeployment.mockResolvedValue(
			deploymentResource
		);
		mockPreviewApi.getPreview.mockReset();
		mockPreviewApi.getPreview.mockResolvedValue(null);

		initDeployHelpersContext({
			logger: {
				debug() {},
				log() {},
				info() {},
				warn() {},
				error() {},
			},
			fetchResult: vi.fn(),
			fetchListResult: vi.fn(),
			fetchPagedListResult: vi.fn(),
			fetchKVGetValue: vi.fn(),
			confirm: vi.fn(),
			prompt: vi.fn(),
			select: vi.fn(),
		});
	});

	afterEach(() => {
		OpenAPI.LOGGER = undefined;
	});

	it("pushes and applies prepared Dockerfile containers directly", async ({
		expect,
	}) => {
		const container = containerConfig();
		const builtDeployment = builtDeploymentFor(container);

		await preview(
			ACCOUNT_ID,
			{
				name: "my-feature",
				ignoreBaseConfig: false,
				json: true,
			},
			config,
			buildResult,
			undefined,
			vi.fn(async () => ({
				scopedContainerConfig: config,
				normalisedContainerConfig: [container],
				builtContainerDeployments: [builtDeployment],
			}))
		);

		expect(pushBuiltContainerImage).toHaveBeenCalledWith(
			builtDeployment.builtImage,
			DEPLOYMENT_ID,
			expect.any(String),
			ACCOUNT_ID,
			config
		);
		expect(apply).toHaveBeenCalledWith(
			{
				imageRef: { newTag: "built:tag" },
				durable_object_namespace_id: "preview-do-ns-id",
			},
			container,
			config,
			ACCOUNT_ID
		);
	});

	it("uses image_uri directly for registry-image containers", async ({
		expect,
	}) => {
		const container = {
			...containerConfig(),
			dockerfile: undefined,
			image_build_context: undefined,
			image_uri: "registry.cloudflare.com/some-account-id/test:latest",
		} as unknown as ContainerNormalizedConfig;
		delete (container as Record<string, unknown>).dockerfile;

		await preview(
			ACCOUNT_ID,
			{
				name: "my-feature",
				ignoreBaseConfig: false,
				json: true,
			},
			config,
			buildResult,
			undefined,
			vi.fn(async () => ({
				scopedContainerConfig: config,
				normalisedContainerConfig: [container],
				builtContainerDeployments: [],
			}))
		);

		expect(pushBuiltContainerImage).not.toHaveBeenCalled();
		expect(apply).toHaveBeenCalledWith(
			{
				imageRef: {
					newTag: "registry.cloudflare.com/some-account-id/test:latest",
				},
				durable_object_namespace_id: "preview-do-ns-id",
			},
			container,
			config,
			ACCOUNT_ID
		);
	});

	it("suppresses generated client debug logs while applying preview containers as JSON", async ({
		expect,
	}) => {
		const container = containerConfig();
		const builtDeployment = builtDeploymentFor(container);
		const openAPILogger = {
			debug: vi.fn(),
			debugWithSanitization: vi.fn(),
			log: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		};
		OpenAPI.LOGGER = openAPILogger;
		vi.mocked(apply).mockImplementationOnce(async () => {
			OpenAPI.LOGGER?.debug("generated client debug output");
			OpenAPI.LOGGER?.debugWithSanitization(
				"RESPONSE:",
				"generated client response"
			);
		});

		await preview(
			ACCOUNT_ID,
			{
				name: "my-feature",
				ignoreBaseConfig: false,
				json: true,
			},
			config,
			buildResult,
			undefined,
			vi.fn(async () => ({
				scopedContainerConfig: config,
				normalisedContainerConfig: [container],
				builtContainerDeployments: [builtDeployment],
			}))
		);

		expect(openAPILogger.debug).not.toHaveBeenCalled();
		expect(openAPILogger.debugWithSanitization).not.toHaveBeenCalled();
		expect(OpenAPI.LOGGER).toBe(openAPILogger);
	});

	it("cleans up built container images when preview deployment creation fails", async ({
		expect,
	}) => {
		const container = containerConfig();
		const builtDeployment = builtDeploymentFor(container);
		mockPreviewApi.createPreviewDeployment.mockRejectedValue(
			new Error("deployment failed")
		);

		await expect(
			preview(
				ACCOUNT_ID,
				{
					name: "my-feature",
					ignoreBaseConfig: false,
					json: true,
				},
				config,
				buildResult,
				undefined,
				vi.fn(async () => ({
					scopedContainerConfig: config,
					normalisedContainerConfig: [container],
					builtContainerDeployments: [builtDeployment],
				}))
			)
		).rejects.toThrow("deployment failed");

		expect(cleanupBuiltContainerImages).toHaveBeenCalledWith(
			[builtDeployment],
			expect.any(String)
		);
	});

	it("cleans up built container images when applying preview containers fails", async ({
		expect,
	}) => {
		const container = containerConfig();
		const builtDeployment = builtDeploymentFor(container);
		vi.mocked(apply).mockRejectedValue(new Error("apply failed"));

		await expect(
			preview(
				ACCOUNT_ID,
				{
					name: "my-feature",
					ignoreBaseConfig: false,
					json: true,
				},
				config,
				buildResult,
				undefined,
				vi.fn(async () => ({
					scopedContainerConfig: config,
					normalisedContainerConfig: [container],
					builtContainerDeployments: [builtDeployment],
				}))
			)
		).rejects.toThrow("apply failed");

		expect(cleanupBuiltContainerImages).toHaveBeenCalledWith(
			[builtDeployment],
			expect.any(String)
		);
	});
});
