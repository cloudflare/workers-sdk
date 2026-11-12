import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { previewBuildOutput } from "../src/preview/preview";
import type {
	PreviewBuildOutput,
	PreviewOptions,
} from "../src/preview/preview";
import type {
	ParsedOutputRootConfig,
	ParsedOutputWorkerConfig,
} from "@cloudflare/config";

const mocks = vi.hoisted(() => ({
	createPreview: vi.fn(),
	createPreviewDeployment: vi.fn(),
	createPreviewParentWorker: vi.fn(),
	editPreview: vi.fn(),
	getPreview: vi.fn(),
	getPreviewDeployment: vi.fn(),
	syncAssets: vi.fn(),
}));

vi.mock("../src/preview/api", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/preview/api")>()),
	createPreview: mocks.createPreview,
	createPreviewDeployment: mocks.createPreviewDeployment,
	createPreviewParentWorker: mocks.createPreviewParentWorker,
	editPreview: mocks.editPreview,
	getPreview: mocks.getPreview,
	getPreviewDeployment: mocks.getPreviewDeployment,
}));

vi.mock("../src/deploy/helpers/assets", () => ({
	syncAssets: mocks.syncAssets,
}));

vi.mock("@cloudflare/containers-shared", async (importOriginal) => ({
	...(await importOriginal<typeof import("@cloudflare/containers-shared")>()),
	verifyDockerInstalled: vi.fn(),
}));

vi.mock("../src/shared/context", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/shared/context")>()),
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

const validRootConfig = { buildContext: { isPreview: true } } as const;

function buildOutputConfig(
	overrides: Partial<ParsedOutputWorkerConfig> = {}
): ParsedOutputWorkerConfig {
	return {
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
		{ workerConfig: config, rootConfig: validRootConfig, buildResult, assets }
	);
}

describe("preview deployment cache settings", () => {
	runInTempDir();

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getPreview.mockResolvedValue(previewResource);
		mocks.getPreviewDeployment.mockResolvedValue(deploymentResource);
		mocks.editPreview.mockResolvedValue(previewResource);
		mocks.createPreviewDeployment.mockResolvedValue(deploymentResource);
	});

	it("sends cache settings as `cache_options`, the field the Previews API reads (#16871)", async ({
		expect,
	}) => {
		await uploadPreview(
			buildOutputConfig({ cache: { enabled: true, crossVersionCache: false } })
		);

		const request = mocks.createPreviewDeployment.mock.calls[0]?.[4];
		expect(request).toMatchObject({
			cache_options: { enabled: true, cross_version_cache: false },
		});
		expect(request).not.toHaveProperty("cache");
	});
});
