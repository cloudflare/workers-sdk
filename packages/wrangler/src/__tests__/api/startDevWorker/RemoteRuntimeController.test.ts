/* eslint-disable workers-sdk/no-vitest-import-expect -- expect used in vi.waitFor callbacks */
import { beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { RemoteRuntimeController } from "../../../api/startDevWorker/RemoteRuntimeController";
import {
	convertBindingsToCfWorkerInitBindings,
	unwrapHook,
} from "../../../api/startDevWorker/utils";
// Import the mocked functions so we can set their behavior
import {
	createPreviewSession,
	createWorkerPreview,
} from "../../../dev/create-worker-preview";
import {
	createRemoteWorkerInit,
	getWorkerAccountAndContext,
} from "../../../dev/remote";
import { getAccessToken } from "../../../user/access";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { useTeardown } from "../../helpers/teardown";
import type {
	Bundle,
	PreviewTokenExpiredEvent,
	StartDevWorkerOptions,
} from "../../../api";
import type { StartDevWorkerInput } from "../../../api/startDevWorker/types";
import type { CfWorkerInit } from "@cloudflare/workers-utils";

// Mock the API modules
vi.mock("../../../dev/create-worker-preview", () => ({
	createPreviewSession: vi.fn(),
	createWorkerPreview: vi.fn(),
}));

vi.mock("../../../dev/remote", () => ({
	getWorkerAccountAndContext: vi.fn(),
	createRemoteWorkerInit: vi.fn(),
	handlePreviewSessionCreationError: vi.fn(),
	handlePreviewSessionUploadError: vi.fn(),
}));

vi.mock("../../../user/access", () => ({
	getAccessToken: vi.fn(),
	domainUsesAccess: vi.fn(),
}));

vi.mock("../../../api/startDevWorker/utils", () => ({
	convertBindingsToCfWorkerInitBindings: vi.fn(),
	unwrapHook: vi.fn(),
}));

function makeConfig(
	overrides: Partial<StartDevWorkerOptions> = {}
): StartDevWorkerOptions {
	return {
		name: "test-worker",
		compatibilityDate: "2025-11-11",
		compatibilityFlags: [],
		bindings: {},
		projectRoot: "/virtual",
		entrypoint: "index.mjs",
		build: {
			bundle: true,
		},
		dev: {
			remote: true,
			persist: false,
			auth: {
				accountId: "test-account-id",
				apiToken: { apiToken: "test-token" },
			},
		},
		complianceRegion: "public",
		...overrides,
	} as StartDevWorkerOptions;
}

function makeBundle(): Bundle {
	return {
		type: "esm",
		modules: [],
		id: 0,
		path: "/virtual/index.mjs",
		entrypointSource:
			"export default { fetch() { return new Response('hello'); } }",
		entry: {
			file: "index.mjs",
			projectRoot: "/virtual/",
			configPath: undefined,
			format: "modules",
			moduleRoot: "/virtual",
			name: undefined,
			exports: [],
		},
		dependencies: {},
		sourceMapPath: undefined,
		sourceMapMetadata: undefined,
	};
}

describe("RemoteRuntimeController", () => {
	mockConsoleMethods();
	const teardown = useTeardown();

	function setup() {
		const bus = new FakeBus();
		const controller = new RemoteRuntimeController(bus);
		teardown(() => controller.teardown());
		return { controller, bus };
	}

	beforeEach(() => {
		// Setup mock implementations
		vi.mocked(unwrapHook).mockResolvedValue({
			accountId: "test-account-id",
			apiToken: { apiToken: "test-token" },
		});

		vi.mocked(getWorkerAccountAndContext).mockResolvedValue({
			workerAccount: {
				accountId: "test-account-id",
				apiToken: { apiToken: "test-token" },
			},
			workerContext: {
				env: undefined,
				useServiceEnvironments: undefined,
				zone: undefined,
				host: undefined,
				routes: undefined,
				sendMetrics: undefined,
			},
		});

		vi.mocked(createPreviewSession).mockResolvedValue({
			id: "test-session-id",
			value: "test-session-value",
			host: "test.workers.dev",
			prewarmUrl: new URL("https://test.workers.dev/prewarm"),
		});

		vi.mocked(createRemoteWorkerInit).mockResolvedValue({
			name: "test-worker",
			main: {
				name: "index.mjs",
				filePath: "/virtual/index.mjs",
				type: "esm",
				content: "export default { fetch() { return new Response('hello'); } }",
			},
			modules: [],
			bindings: {} as StartDevWorkerInput["bindings"],
			migrations: undefined,
			compatibility_date: "2025-11-11",
			compatibility_flags: [],
			keepVars: true,
			keepSecrets: true,
			logpush: false,
			sourceMaps: undefined,
			assets: undefined,
			placement: undefined,
			tail_consumers: undefined,
			limits: undefined,
			observability: undefined,
			containers: undefined,
		});

		vi.mocked(createWorkerPreview).mockResolvedValue({
			value: "test-preview-token",
			host: "test.workers.dev",
			prewarmUrl: new URL("https://test.workers.dev/prewarm"),
			tailUrl: "wss://test.workers.dev/tail",
		});

		vi.mocked(getAccessToken).mockResolvedValue(undefined);

		vi.mocked(convertBindingsToCfWorkerInitBindings).mockResolvedValue({
			bindings: {} as CfWorkerInit["bindings"],
			fetchers: {},
		});
	});

	describe("preview token refresh", () => {
		it("should handle missing state gracefully", async () => {
			const { controller } = setup();

			const expiredEvent: PreviewTokenExpiredEvent = {
				type: "previewTokenExpired",
				proxyData: {
					userWorkerUrl: {
						protocol: "https:",
						hostname: "test.workers.dev",
						port: "443",
					},
					headers: {
						"cf-workers-preview-token": "expired-token",
					},
				},
			};

			// Call before any bundleComplete has happened
			controller.onPreviewTokenExpired(expiredEvent);

			// Wait for async work to complete and warning to be logged
			await vi.waitFor(() => {
				expect(console.warn).toHaveBeenCalledWith(
					expect.stringContaining("Cannot refresh preview token")
				);
			});
		});

		it("should call API with stored config/bundle when refreshing", async () => {
			const { controller, bus } = setup();
			const config = makeConfig({ name: "my-worker" });
			const bundle = makeBundle();

			// Setup initial state
			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });

			// Wait for initial reload to complete
			await bus.waitFor("reloadComplete");

			// Clear mock call history to only track refresh calls
			vi.mocked(createWorkerPreview).mockClear();
			vi.mocked(createRemoteWorkerInit).mockClear();

			// Trigger token expired
			const expiredEvent: PreviewTokenExpiredEvent = {
				type: "previewTokenExpired",
				proxyData: {
					userWorkerUrl: {
						protocol: "https:",
						hostname: "test.workers.dev",
						port: "443",
					},
					headers: {
						"cf-workers-preview-token": "expired-token",
					},
				},
			};

			controller.onPreviewTokenExpired(expiredEvent);

			// Wait for refresh to complete
			await bus.waitFor("reloadComplete");

			// Verify createRemoteWorkerInit was called with the stored bundle
			expect(createRemoteWorkerInit).toHaveBeenCalledTimes(1);
			expect(createRemoteWorkerInit).toHaveBeenCalledWith(
				expect.objectContaining({
					bundle,
					name: "my-worker",
					accountId: "test-account-id",
				})
			);

			// Verify createWorkerPreview was called
			expect(createWorkerPreview).toHaveBeenCalledTimes(1);
		});

		it("should emit reloadComplete event with fresh token when refreshing", async () => {
			const { controller, bus } = setup();
			const config = makeConfig();
			const bundle = makeBundle();

			// Setup initial state
			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });

			// Wait for initial reload
			await bus.waitFor("reloadComplete");

			// Trigger token expired
			const expiredEvent: PreviewTokenExpiredEvent = {
				type: "previewTokenExpired",
				proxyData: {
					userWorkerUrl: {
						protocol: "https:",
						hostname: "test.workers.dev",
						port: "443",
					},
					headers: {
						"cf-workers-preview-token": "expired-token",
					},
				},
			};

			controller.onPreviewTokenExpired(expiredEvent);

			// Wait for refresh reload
			const reloadEvent = await bus.waitFor("reloadComplete");

			// Should have emitted a reloadComplete event with the new token
			expect(reloadEvent).toMatchObject({
				type: "reloadComplete",
				proxyData: {
					headers: {
						"cf-workers-preview-token": "test-preview-token",
					},
				},
			});
		});
	});
});
