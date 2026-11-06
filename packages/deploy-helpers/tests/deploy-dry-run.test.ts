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
	FetchKVGetValueFetcher,
	FetchListResultFetcher,
	FetchPagedListResultFetcher,
	FetchResultFetcher,
	Logger,
} from "@cloudflare/workers-utils";

// preUploadApiChecks is skipped on dry runs anyway; mock it so that a real
// (non-dry-run) deploy in these tests only reports API calls made by the
// deployment-state check under test.
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

vi.mock("../src/deploy/helpers/exports", () => ({
	resolveExportsUploadPayload: async () => ({
		exports: undefined,
		migrations: undefined,
	}),
}));

vi.mock("../src/triggers/deploy", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/triggers/deploy")>()),
	triggersDeploy: async () => [],
}));

/**
 * A dry run must not talk to the Cloudflare API at all: it has no deployment
 * credentials, so any request fails with an authentication error before the
 * dry-run handling takes effect. See workers-sdk#16109.
 */
describe("deploy dry runs", () => {
	const fetchResult = vi.fn(async (_complianceConfig: unknown, path: string) => {
		// `confirmLatestDeploymentOverwriteAndGetLatest` fetches the Worker's
		// latest deployment; the upload path PUTs the Worker itself.
		if (path.includes("/deployments")) {
			return { deployments: [] };
		}
		return {
			id: null,
			etag: null,
			pipeline_hash: null,
			mutable_pipeline_id: null,
			deployment_id: "00000000000000000000000000000001",
			startup_time_ms: 0,
		};
	}) as FetchResultFetcher;
	const fetchListResult = vi.fn() as FetchListResultFetcher;
	const fetchPagedListResult = vi.fn() as FetchPagedListResultFetcher;
	const fetchKVGetValue = vi.fn() as FetchKVGetValueFetcher;

	const logger = {
		debug: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		log: vi.fn(),
		warn: vi.fn(),
	} as unknown as Logger;

	beforeEach(() => {
		vi.clearAllMocks();
		initDeployHelpersContext({
			confirm: vi.fn(),
			fetchKVGetValue,
			fetchListResult,
			fetchPagedListResult,
			fetchResult,
			logger,
			prompt: vi.fn(),
			select: vi.fn(),
		});
	});

	function buildProps(dryRun: boolean): DeployProps {
		return {
			accountId: "some-account-id",
			assetsDir: undefined,
			autoRegisterWorkersDevSubdomain: undefined,
			cliVars: {},
			command: "deploy",
			compatibilityDate: "2026-09-24",
			compatibilityFlags: [],
			containers: {
				durableObjects: { builtImages: [] },
				source: undefined,
				standard: { builtImages: [], normalized: [] },
			},
			containersRollout: undefined,
			dispatchNamespace: undefined,
			dryRun,
			entry: {
				configPath: undefined,
				exports: [],
				file: "index.js",
				format: "modules",
				moduleRoot: ".",
				projectRoot: ".",
			},
			env: undefined,
			experimentalAutoCreate: false,
			failIfWorkerNameTaken: false,
			isWorkersSite: false,
			keepVars: false,
			legacyAssetPaths: undefined,
			logpush: undefined,
			main: "index.js",
			message: undefined,
			name: "test-worker",
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
			workerNameOverridden: false,
		} satisfies DeployProps;
	}

	const buildResult = {
		bundleType: "esm",
		content: "export default {}",
		dependencies: {},
		modules: [],
		resolvedEntryPointPath: "index.js",
		sourceMaps: undefined,
	} satisfies WorkerBuildResult;

	const deployOptions = {
		deployCommand: "test-cli deploy",
		versionsDeployCommand: "test-cli versions deploy",
		d1ListCommand: "test-cli d1 list",
		d1DeleteCommand: "test-cli d1 delete <database-id>",
		queueCreateCommand: (queueName: string) => `test-cli queue create ${queueName}`,
		secretPutCommand: "test-cli secret put",
		workersDevConfigFieldName: "workersDev",
		workersDevConfigAssignment: (value: boolean) => `workersDev: ${value}`,
		previewUrlsConfigFieldName: "previewUrls",
		previewUrlsConfigAssignment: (value: boolean) => `previewUrls: ${value}`,
		configFileName: "test config",
		observabilityTargetPercentageField: "targetInstancePercentage",
		observabilityTargetCountField: "targetInstanceCount",
		syncWorkersSite: undefined,
	};

	it("makes no Cloudflare API requests when dryRun is true", async ({
		expect,
	}) => {
		const config = {
			...defaultWranglerConfig,
			name: "test-worker",
		};

		await deploy(
			buildProps(true),
			config as ContainerlessConfig,
			buildResult,
			deployOptions
		);

		expect(fetchResult).not.toHaveBeenCalled();
		expect(fetchListResult).not.toHaveBeenCalled();
		expect(fetchPagedListResult).not.toHaveBeenCalled();
		expect(fetchKVGetValue).not.toHaveBeenCalled();
	});

	it("still checks the latest deployment on a real deploy", async ({
		expect,
	}) => {
		const config = {
			...defaultWranglerConfig,
			name: "test-worker",
		};

		await deploy(
			buildProps(false),
			config as ContainerlessConfig,
			buildResult,
			deployOptions
		);

		expect(fetchResult).toHaveBeenCalledWith(
			expect.anything(),
			"/accounts/some-account-id/workers/scripts/test-worker/deployments"
		);
	});
});
