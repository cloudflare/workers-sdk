import { writeOutput } from "@cloudflare/workers-utils";
import { defaultWranglerConfig } from "@cloudflare/workers-utils/config";
import { beforeEach, describe, it, vi } from "vitest";
import deploy from "../src/deploy/deploy";
import { preUploadApiChecks } from "../src/deploy/helpers/validate-worker-props";
import { initDeployHelpersContext } from "../src/shared/context";
import type { DeployOptions } from "../src/deploy/deploy";
import type { DeployProps, WorkerBuildResult } from "../src/shared/types";
import type { FetchResultFetcher } from "@cloudflare/workers-utils";

vi.mock("@cloudflare/workers-utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/workers-utils")>()),
	writeOutput: vi.fn(),
}));

vi.mock(
	"../src/deploy/helpers/validate-worker-props",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("../src/deploy/helpers/validate-worker-props")
		>()),
		preUploadApiChecks: vi.fn(),
	})
);

vi.mock("../src/deploy/helpers/exports", () => ({
	resolveExportsUploadPayload: async () => ({}),
}));

vi.mock("../src/triggers/deploy", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/triggers/deploy")>()),
	triggersDeploy: async () => [],
}));

const { containers: _containers, ...config } = {
	...defaultWranglerConfig,
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
		source: undefined,
		standard: { builtImages: [], normalized: [] },
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
		exports: [],
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
const confirmTrafficSplitReplacement =
	vi.fn<NonNullable<DeployOptions["confirmTrafficSplitReplacement"]>>();
const options: DeployOptions = {
	deployCommand: "test-cli deploy",
	versionsDeployCommand: "test-cli versions deploy",
	confirmTrafficSplitReplacement,
	d1ListCommand: "test-cli d1 list",
	d1DeleteCommand: "test-cli d1 delete",
	queueCreateCommand: (name) => `test-cli queue create ${name}`,
	secretPutCommand: "test-cli secret put",
	workersDevConfigFieldName: "workersDev",
	workersDevConfigAssignment: String,
	previewUrlsConfigFieldName: "previewUrls",
	previewUrlsConfigAssignment: String,
	configFileName: "test config",
	observabilityTargetPercentageField: "targetInstancePercentage",
	observabilityTargetCountField: "targetInstanceCount",
	syncWorkersSite: undefined,
};
const split = {
	id: "existing-deployment",
	versions: [
		{ version_id: "first", percentage: 75 },
		{ version_id: "second", percentage: 25 },
	],
};
const changedSplit = { ...split, id: "new-deployment" };
const fetchResult = vi.fn<FetchResultFetcher>();
const preUpload = vi.mocked(preUploadApiChecks);

describe("deploy traffic split approval", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		fetchResult.mockResolvedValue({ deployments: [split] });
		preUpload.mockResolvedValue({
			aborted: true,
			workerTag: null,
			tags: [],
			workerExists: true,
		});
		initDeployHelpersContext({
			confirm: vi.fn(),
			fetchKVGetValue: vi.fn(),
			fetchListResult: vi.fn(),
			fetchPagedListResult: vi.fn(),
			fetchResult: fetchResult as FetchResultFetcher,
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

	it("declines before queue provisioning or upload and does not record a deploy", async ({
		expect,
	}) => {
		confirmTrafficSplitReplacement.mockResolvedValue(false);
		await expect(
			deploy(props, config, buildResult, options)
		).resolves.toMatchObject({
			trafficSplitReplacementDeclined: true,
			versionId: null,
		});
		expect(confirmTrafficSplitReplacement).toHaveBeenCalledExactlyOnceWith(
			split.versions
		);
		expect(preUpload).not.toHaveBeenCalled();
		expect(fetchResult).toHaveBeenCalledExactlyOnceWith(
			config,
			"/accounts/account/workers/scripts/worker/deployments"
		);
		expect(writeOutput).not.toHaveBeenCalled();
	});

	it("confirms before the API checks and promotes the new version when the split is unchanged", async ({
		expect,
	}) => {
		const versionId = "00000000-0000-4000-8000-000000000001";
		const deploymentPath =
			"/accounts/account/workers/scripts/worker/deployments";
		preUpload.mockResolvedValue({
			aborted: false,
			workerTag: null,
			tags: [],
			workerExists: true,
		});
		confirmTrafficSplitReplacement.mockResolvedValue(true);
		fetchResult
			.mockResolvedValueOnce({ deployments: [split] })
			.mockResolvedValueOnce({
				id: versionId,
				resources: { script: { etag: "etag" } },
			})
			.mockResolvedValueOnce({ deployments: [split] })
			.mockResolvedValue({});
		await expect(
			deploy(props, config, buildResult, options)
		).resolves.toMatchObject({ versionId });
		expect(confirmTrafficSplitReplacement).toHaveBeenCalledBefore(preUpload);
		expect(fetchResult).toHaveBeenNthCalledWith(3, config, deploymentPath);
		expect(fetchResult).toHaveBeenNthCalledWith(4, config, deploymentPath, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				strategy: "percentage",
				versions: [{ version_id: versionId, percentage: 100 }],
				annotations: {},
			}),
		});
		expect(writeOutput).toHaveBeenCalledWith(
			expect.objectContaining({ version_id: versionId })
		);
	});

	it("fails closed if confirmation rejects", async ({ expect }) => {
		const error = new Error("Prompt failed");
		confirmTrafficSplitReplacement.mockRejectedValue(error);
		await expect(deploy(props, config, buildResult, options)).rejects.toBe(
			error
		);
		expect(preUpload).not.toHaveBeenCalled();
		expect(writeOutput).not.toHaveBeenCalled();
	});

	it.for([{ dryRun: true }, { dispatchNamespace: "namespace" }])(
		"skips the split check for %j",
		async (overrides, { expect }) => {
			await deploy({ ...props, ...overrides }, config, buildResult, options);
			expect(preUpload).toHaveBeenCalledOnce();
			expect(confirmTrafficSplitReplacement).not.toHaveBeenCalled();
			expect(fetchResult).not.toHaveBeenCalled();
		}
	);

	it.for([true, false])(
		"refuses to overwrite a changed split (versioned deploy: %s)",
		async (workerExists, { expect }) => {
			preUpload.mockResolvedValue({
				aborted: false,
				workerTag: null,
				tags: [],
				workerExists,
			});
			confirmTrafficSplitReplacement.mockResolvedValue(true);
			fetchResult.mockImplementation(
				async <ResponseType>(_config: unknown, endpoint: string) => {
					if (endpoint.endsWith("/versions")) {
						return { id: "uploaded-version" } as ResponseType;
					}
					if (endpoint.endsWith("/deployments")) {
						return {
							deployments: [
								fetchResult.mock.calls.length === 1 ? split : changedSplit,
							],
						} as ResponseType;
					}
					throw new Error(`Unexpected request: ${endpoint}`);
				}
			);
			await expect(deploy(props, config, buildResult, options)).rejects.toThrow(
				"A different traffic split became active"
			);
			expect(
				fetchResult.mock.calls.map(([, endpoint, init]) => [
					init?.method ?? "GET",
					endpoint.split("/").at(-1),
				])
			).toEqual([
				["GET", "deployments"],
				...(workerExists ? [["POST", "versions"]] : []),
				["GET", "deployments"],
			]);
			expect(writeOutput).not.toHaveBeenCalled();
		}
	);
});
