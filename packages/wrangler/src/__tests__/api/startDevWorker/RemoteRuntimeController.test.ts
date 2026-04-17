import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { RemoteRuntimeController } from "../../../api/startDevWorker/RemoteRuntimeController";
// Import the mocked functions so we can set their behavior
import {
	createPreviewSession,
	createWorkerPreview,
} from "../../../dev/create-worker-preview";
import {
	createRemoteWorkerInit,
	getWorkerAccountAndContext,
} from "../../../dev/remote";
import { getAccessHeaders } from "../../../user/access";
import { FakeBus } from "../../helpers/fake-bus";
import { mockConsoleMethods } from "../../helpers/mock-console";
import { useTeardown } from "../../helpers/teardown";
import type {
	Bundle,
	PreviewTokenExpiredEvent,
	StartDevWorkerOptions,
} from "../../../api";

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
	getAccessHeaders: vi.fn(),
	domainUsesAccess: vi.fn(),
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
			value: "test-session-value",
			host: "test.workers.dev",
			name: "test",
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
			bindings: {},
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
			cache: undefined,
		});

		vi.mocked(createWorkerPreview).mockResolvedValue({
			value: "test-preview-token",
			host: "test.workers.dev",
			// No tailUrl — avoids real WebSocket connections in unit tests
		});

		vi.mocked(getAccessHeaders).mockResolvedValue({});
	});

	describe("proactive token refresh", () => {
		afterEach(() => vi.useRealTimers());

		it("should proactively refresh the token before expiry", async ({
			expect,
		}) => {
			vi.useFakeTimers();

			const { controller, bus } = setup();
			const config = makeConfig();
			const bundle = makeBundle();

			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });
			await bus.waitFor("reloadComplete");

			vi.mocked(createWorkerPreview).mockClear();
			vi.mocked(createRemoteWorkerInit).mockClear();
			vi.mocked(createWorkerPreview).mockResolvedValue({
				value: "proactively-refreshed-token",
				host: "test.workers.dev",
			});

			// Register the waiter before advancing so it's in place when the
			// event fires. Use a timeout larger than the advance window so the
			// waiter's own faked setTimeout doesn't race the refresh timer.
			const reloadPromise = bus.waitFor(
				"reloadComplete",
				undefined,
				60 * 60 * 1000
			);
			await vi.advanceTimersByTimeAsync(50 * 60 * 1000 + 1);
			const reloadEvent = await reloadPromise;

			expect(createWorkerPreview).toHaveBeenCalledTimes(1);
			expect(reloadEvent).toMatchObject({
				type: "reloadComplete",
				proxyData: {
					headers: {
						"cf-workers-preview-token": "proactively-refreshed-token",
					},
				},
			});
		});

		it("should cancel the proactive refresh timer on bundle start", async ({
			expect,
		}) => {
			vi.useFakeTimers();

			const { controller, bus } = setup();
			const config = makeConfig();
			const bundle = makeBundle();

			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });
			await bus.waitFor("reloadComplete");

			vi.mocked(createWorkerPreview).mockClear();

			// A new bundleStart cancels the old timer before it fires
			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });
			await bus.waitFor("reloadComplete");

			vi.mocked(createWorkerPreview).mockClear();

			// Advance to just before T2 would fire — no proactive refresh should occur
			await vi.advanceTimersByTimeAsync(50 * 60 * 1000 - 1);
			expect(createWorkerPreview).not.toHaveBeenCalled();
		});

		it("should cancel the proactive refresh timer on teardown", async ({
			expect,
		}) => {
			vi.useFakeTimers();

			const { controller, bus } = setup();
			const config = makeConfig();
			const bundle = makeBundle();

			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });
			await bus.waitFor("reloadComplete");

			vi.mocked(createWorkerPreview).mockClear();
			await controller.teardown();

			// Advance past where the timer would have fired
			await vi.advanceTimersByTimeAsync(50 * 60 * 1000 + 1);
			expect(createWorkerPreview).not.toHaveBeenCalled();
		});
	});

	describe("preview token refresh", () => {
		it("should handle missing state gracefully", async ({ expect }) => {
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

		it("should call API with stored config/bundle when refreshing", async ({
			expect,
		}) => {
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

		it("should emit reloadComplete event with fresh token when refreshing", async ({
			expect,
		}) => {
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
