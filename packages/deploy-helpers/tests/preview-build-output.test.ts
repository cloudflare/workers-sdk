import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { previewBuildOutput } from "../src/preview/preview";
import type { PreviewBuildOutput } from "../src/preview/preview";
import type {
	ParsedOutputSettingsConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";

const mocks = vi.hoisted(() => ({
	createPreview: vi.fn(),
	createPreviewDeployment: vi.fn(),
	createPreviewParentWorker: vi.fn(),
	editPreview: vi.fn(),
	getPreview: vi.fn(),
	syncAssets: vi.fn(),
}));

vi.mock("../src/preview/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/preview/api")>()),
	createPreview: mocks.createPreview,
	createPreviewDeployment: mocks.createPreviewDeployment,
	createPreviewParentWorker: mocks.createPreviewParentWorker,
	editPreview: mocks.editPreview,
	getPreview: mocks.getPreview,
}));

vi.mock("../src/deploy/helpers/assets", () => ({
	syncAssets: mocks.syncAssets,
}));

vi.mock("../src/shared/context", () => ({
	logger: {
		log: vi.fn(),
		warn: vi.fn(),
	},
}));

const previewResource = {
	id: "preview-id",
	name: "feature",
	slug: "feature",
	worker_name: "preview-worker",
	created_on: "2026-09-17T00:00:00Z",
	updated_on: "2026-09-17T00:00:00Z",
};

const deploymentResource = {
	id: "deployment-id",
	preview_id: "preview-id",
	preview_name: "feature",
	created_on: "2026-09-17T00:00:00Z",
};

const buildResult: PreviewBuildOutput["buildResult"] = {
	resolvedEntryPointPath: "/tmp/index.js",
	bundleType: "esm",
	content: "export default {};",
	modules: [],
	sourceMaps: undefined,
	dependencies: {},
};

const projectSettings = { type: "settings", isPreview: true } as const;

function buildOutputConfig(
	overrides: Partial<ParsedOutputWorkerConfig> = {}
): ParsedOutputWorkerConfig {
	return {
		type: "worker",
		name: "preview-worker",
		compatibilityDate: "2026-09-17",
		...overrides,
	};
}

function uploadPreview(
	config: ParsedOutputWorkerConfig,
	assets?: PreviewBuildOutput["assets"]
) {
	return previewBuildOutput(
		"account-id",
		{ name: "feature", json: true },
		{ workerConfig: config, projectSettings, buildResult, assets }
	);
}

describe("previewBuildOutput", () => {
	runInTempDir();

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getPreview.mockResolvedValue(previewResource);
		mocks.editPreview.mockResolvedValue(previewResource);
		mocks.createPreview.mockResolvedValue(previewResource);
		mocks.createPreviewParentWorker.mockResolvedValue(undefined);
		mocks.createPreviewDeployment.mockResolvedValue(deploymentResource);
		mocks.syncAssets.mockResolvedValue({ jwt: "asset-token" });
	});

	it("uploads only bindings and settings from resolved Build Output", async ({
		expect,
	}) => {
		await uploadPreview(
			buildOutputConfig({
				compatibilityFlags: ["nodejs_compat"],
				env: {
					PREVIEW_KV: { type: "kv", id: "preview-kv-id" },
					SERVICE: {
						type: "worker",
						worker: "service-worker",
						props: { greeting: "hello" },
					},
					MEMORY: { type: "agent-memory", namespace: "memory" },
					VPC: { type: "vpc-network", tunnelId: "tunnel-id" },
					VPC_NETWORK: { type: "vpc-network", networkId: "network-id" },
					LOG: { type: "logfwdr", destination: "log-destination" },
				},
				exports: {
					PreviewDO: { type: "durable-object", storage: "sqlite" },
				},
				limits: { cpuMs: 50 },
				cache: { enabled: true, crossVersionCache: true },
				placement: { mode: "smart" },
				assets: {
					htmlHandling: "auto-trailing-slash",
					runWorkerFirst: true,
				},
				observability: { enabled: true },
				logpush: true,
				tailConsumers: [{ worker: "tail-worker" }],
			}),
			{
				directory: "/tmp/assets",
			}
		);

		expect(mocks.editPreview).toHaveBeenCalledWith(
			expect.objectContaining({ name: "preview-worker" }),
			"account-id",
			"preview-worker",
			"feature",
			{
				observability: { enabled: true },
				logpush: true,
				tail_consumers: [{ name: "tail-worker" }],
			}
		);
		expect(mocks.createPreviewDeployment).toHaveBeenCalledOnce();
		const request = mocks.createPreviewDeployment.mock.calls[0]?.[4];
		expect(request).toMatchObject({
			main_module: "index.js",
			compatibility_date: "2026-09-17",
			compatibility_flags: ["nodejs_compat"],
			limits: { cpu_ms: 50 },
			cache: { enabled: true, cross_version_cache: true },
			placement: { mode: "smart" },
			env: {
				PREVIEW_KV: { type: "kv_namespace", namespace_id: "preview-kv-id" },
				SERVICE: {
					type: "service",
					service: "service-worker",
					props: { greeting: "hello" },
				},
				MEMORY: { type: "agent_memory", namespace: "memory" },
				VPC: { type: "vpc_network", tunnel_id: "tunnel-id" },
				VPC_NETWORK: { type: "vpc_network", network_id: "network-id" },
				LOG: { type: "logfwdr", destination: "log-destination" },
			},
			exports: {
				PreviewDO: { type: "durable-object", storage: "sqlite" },
			},
			assets: {
				jwt: "asset-token",
				config: {
					html_handling: "auto-trailing-slash",
					run_worker_first: true,
				},
			},
		});
		expect(request).not.toHaveProperty("migrations");
	});

	it("keeps Preview base config enabled when Build Output omits settings", async ({
		expect,
	}) => {
		mocks.getPreview.mockRejectedValue({ code: 10007 });
		await uploadPreview(buildOutputConfig({ tailConsumers: [] }));

		expect(mocks.createPreview).toHaveBeenCalledWith(
			expect.objectContaining({ name: "preview-worker" }),
			"account-id",
			"preview-worker",
			{ name: "feature", tail_consumers: [] },
			{ ignoreBaseConfig: false }
		);
		const request = mocks.createPreviewDeployment.mock.calls[0]?.[4];
		expect(request).not.toHaveProperty("env");
		expect(request).not.toHaveProperty("compatibility_flags");
		expect(request).not.toHaveProperty("exports");
		expect(request).not.toHaveProperty("limits");
		expect(request).not.toHaveProperty("cache");
		expect(request).not.toHaveProperty("placement");
		expect(mocks.createPreviewDeployment.mock.calls[0]).toHaveLength(5);
		expect(mocks.createPreviewParentWorker).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "preview-worker",
				workers_dev: false,
				preview_urls: true,
			}),
			"account-id",
			"preview-worker",
			false,
			true
		);
		expect(mocks.editPreview).toHaveBeenCalledWith(
			expect.anything(),
			"account-id",
			"preview-worker",
			"feature",
			{ tail_consumers: [] }
		);
	});

	it("applies explicit disabled Preview settings", async ({ expect }) => {
		await uploadPreview(
			buildOutputConfig({
				observability: { enabled: false },
				logpush: false,
				tailConsumers: [],
			})
		);

		expect(mocks.editPreview).toHaveBeenCalledWith(
			expect.anything(),
			"account-id",
			"preview-worker",
			"feature",
			{
				observability: { enabled: false },
				logpush: false,
				tail_consumers: [],
			}
		);
	});

	it("uploads assets-only output with its routing files", async ({
		expect,
	}) => {
		const directory = path.join(process.cwd(), "assets");
		mkdirSync(directory);
		writeFileSync(path.join(directory, "_headers"), "/assets/*\n  X-Test: yes");
		writeFileSync(path.join(directory, "_redirects"), "/old /new 301");

		await previewBuildOutput(
			"account-id",
			{ name: "feature", json: true },
			{
				workerConfig: buildOutputConfig({ assets: {} }),
				projectSettings,
				assets: { directory },
			}
		);

		const request = mocks.createPreviewDeployment.mock.calls[0]?.[4];
		expect(request).not.toHaveProperty("main_module");
		expect(request).toMatchObject({
			assets: { jwt: "asset-token" },
			modules: [
				{
					name: "_headers",
					content_type: "text/plain",
					content: "/assets/*\n  X-Test: yes",
				},
				{
					name: "_redirects",
					content_type: "text/plain",
					content: "/old /new 301",
				},
			],
		});
	});

	it("preserves a nested main module path", async ({ expect }) => {
		await previewBuildOutput(
			"account-id",
			{ name: "feature", json: true },
			{
				workerConfig: buildOutputConfig({
					manifest: {
						type: "complete",
						mainModule: "server/index.js",
						modules: {
							"server/index.js": { type: "esm" },
							"server/chunk.js": { type: "esm" },
						},
					},
				}),
				projectSettings,
				buildResult: {
					...buildResult,
					resolvedEntryPointPath: "/tmp/bundle/server/index.js",
					content: 'import "./chunk.js";',
					modules: [
						{
							name: "server/chunk.js",
							filePath: "/tmp/bundle/server/chunk.js",
							content: "export {};",
							type: "esm",
						},
					],
				},
			}
		);

		const request = mocks.createPreviewDeployment.mock.calls[0]?.[4];
		expect(request.main_module).toBe("server/index.js");
		expect(request.modules).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "server/index.js" }),
				expect.objectContaining({ name: "server/chunk.js" }),
			])
		);
	});

	it("inherits resource bindings without identifiers", async ({ expect }) => {
		await uploadPreview(
			buildOutputConfig({
				env: {
					KV: { type: "kv" },
					D1: { type: "d1" },
					R2: { type: "r2" },
				},
			})
		);

		const request = mocks.createPreviewDeployment.mock.calls[0]?.[4];
		expect(request).not.toHaveProperty("env");
	});

	it.for<[string, ParsedOutputSettingsConfig | undefined]>([
		["missing", undefined],
		["non-Preview", { type: "settings", isPreview: false }],
	])("rejects $0 Preview intent", async ([, settings], { expect }) => {
		const invalidBuildOutput = {
			workerConfig: buildOutputConfig(),
			projectSettings: settings,
			buildResult,
		} as unknown as PreviewBuildOutput;
		await expect(
			previewBuildOutput(
				"account-id",
				{ name: "feature", json: true },
				invalidBuildOutput
			)
		).rejects.toThrow(/Preview build/);
		expect(mocks.getPreview).not.toHaveBeenCalled();
	});

	it.for<[string, Partial<ParsedOutputWorkerConfig>]>([
		["custom domains", { domains: ["preview.example.com"] }],
		["triggers", { triggers: [{ type: "scheduled", schedule: "0 * * * *" }] }],
		[
			"streaming tail consumers",
			{ tailConsumers: [{ worker: "tail-worker", streaming: true }] },
		],
		[
			"Container-backed Durable Objects",
			{
				exports: {
					ContainerDO: {
						type: "durable-object",
						storage: "sqlite",
						container: "container-app",
					},
				},
			},
		],
		["unsafe metadata", { unsafe: { metadata: { custom: true } } }],
		[
			"Cap'n Proto schemas",
			{ unsafe: { capnp: { compiledSchema: "schema.bin" } } },
		],
	])("rejects $0 before calling the API", async ([, config], { expect }) => {
		await expect(uploadPreview(buildOutputConfig(config))).rejects.toThrow(
			/don't support/
		);
		expect(mocks.getPreview).not.toHaveBeenCalled();
	});
});
