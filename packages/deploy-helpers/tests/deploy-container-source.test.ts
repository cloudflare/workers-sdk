import {
	deployContainers,
	pushBuiltContainerImage,
} from "@cloudflare/containers-shared";
import { defaultWranglerConfig } from "@cloudflare/workers-utils";
import { beforeEach, describe, it, vi } from "vitest";
import deploy from "../src/deploy/deploy";
import { initDeployHelpersContext } from "../src/shared/context";
import type {
	ContainerlessConfig,
	DeployProps,
	WorkerBuildResult,
} from "../src/shared/types";
import type {
	BuiltContainerImage,
	ContainerNormalizedConfig,
} from "@cloudflare/containers-shared";
import type {
	ContainerApp,
	FetchResultFetcher,
} from "@cloudflare/workers-utils";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/containers-shared")>()),
	deployContainers: vi.fn(),
	pushBuiltContainerImage: vi.fn(),
}));

vi.mock("../src/deploy/helpers/confirm-latest-deployment-overwrite", () => ({
	confirmLatestDeploymentOverwriteAndGetLatest: async () => ({
		confirmed: true,
		latestDeployment: undefined,
	}),
}));

vi.mock("../src/deploy/helpers/container-metadata", () => ({
	getContainerMetadata: () => [],
	getContainerMetadataForRolloutSkip: () => undefined,
}));

vi.mock("../src/deploy/helpers/durable-object-container-applications", () => ({
	deployDurableObjectContainerApplications: async () => {},
	prepareDurableObjectContainerApplications: async () => ({}),
}));

vi.mock("../src/deploy/helpers/exports", () => ({
	resolveExportsUploadPayload: async () => ({
		exports: undefined,
		migrations: undefined,
	}),
}));

vi.mock("../src/deploy/helpers/validate-worker-props", () => ({
	preUploadApiChecks: async () => ({
		aborted: false,
		tags: [],
		workerExists: false,
		workerTag: null,
	}),
	validateWorkerProps: (props: DeployProps) => ({
		...props,
		name: props.name ?? "worker",
	}),
}));

vi.mock("../src/triggers/deploy", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/triggers/deploy")>()),
	triggersDeploy: async () => [],
}));

describe("deploy container source", () => {
	const sourceContainer = {
		name: "sandbox",
		class_name: "Sandbox",
		image: "sandbox:local",
	} satisfies ContainerApp;
	const normalizedContainer = {
		name: "sandbox",
		class_name: "Sandbox",
		dockerfile: "./Dockerfile",
	} as ContainerNormalizedConfig;
	const builtImage = {
		container: normalizedContainer,
		localTag: "sandbox:local",
	} satisfies BuiltContainerImage;
	const fetchResult = vi.fn<FetchResultFetcher>();

	beforeEach(() => {
		vi.clearAllMocks();
		fetchResult.mockResolvedValue({
			deployment_id: "00000000000000000000000000000001",
			etag: null,
			id: null,
			mutable_pipeline_id: null,
			pipeline_hash: null,
			startup_time_ms: 0,
		});
		vi.mocked(pushBuiltContainerImage).mockResolvedValue({
			newTag: "sandbox:remote",
		});
		initDeployHelpersContext({
			confirm: vi.fn(),
			fetchKVGetValue: vi.fn(),
			fetchListResult: vi.fn(),
			fetchPagedListResult: vi.fn(),
			fetchResult,
			logger: {
				debug: vi.fn(),
				error: vi.fn(),
				info: vi.fn(),
				log: vi.fn(),
				warn: vi.fn(),
			} as never,
			prompt: vi.fn(),
			select: vi.fn(),
		});
	});

	it("restores the resolved container source before applying containers", async ({
		expect,
	}) => {
		const { containers: _containers, ...config } = {
			...defaultWranglerConfig,
			dependencies_instrumentation: { enabled: false },
			name: "worker",
		};
		const props = {
			accountId: "account",
			assetsDir: undefined,
			cliVars: {},
			command: "deploy",
			compatibilityDate: "2026-09-24",
			compatibilityFlags: [],
			containers: {
				durableObjects: { builtImages: [] },
				source: [sourceContainer],
				standard: {
					builtImages: [builtImage],
					normalized: [normalizedContainer],
				},
			},
			containersRollout: undefined,
			dispatchNamespace: undefined,
			dryRun: false,
			entry: {
				configPath: undefined,
				file: "index.js",
				format: "modules",
				moduleRoot: ".",
				projectRoot: ".",
			},
			env: undefined,
			experimentalAutoCreate: false,
			isWorkersSite: false,
			keepVars: false,
			legacyAssetPaths: undefined,
			logpush: undefined,
			main: "index.js",
			message: undefined,
			name: "worker",
			oldAssetTtl: undefined,
			outfile: undefined,
			resourcesProvision: false,
			routes: [],
			secretsFile: undefined,
			sendMetrics: false,
			skipProvisioningConfigWriteback: false,
			strict: false,
			tag: undefined,
			triggers: undefined,
		} satisfies DeployProps;
		const buildResult = {
			bundleType: "esm",
			content: "export default {}",
			dependencies: {},
			modules: [],
			resolvedEntryPointPath: "index.js",
			sourceMaps: undefined,
		} satisfies WorkerBuildResult;

		expect(config).not.toHaveProperty("containers");
		await deploy(props, config as ContainerlessConfig, buildResult, {
			syncWorkersSite: undefined,
		});

		expect(deployContainers).toHaveBeenCalledWith(
			expect.objectContaining({ containers: [sourceContainer] }),
			[
				{
					container: normalizedContainer,
					imageRef: { newTag: "sandbox:remote" },
				},
			],
			{
				accountId: "account",
				dispatchNamespace: undefined,
				scriptName: "worker",
				versionId: "00000000-0000-0000-0000-000000000001",
			}
		);
	});
});
