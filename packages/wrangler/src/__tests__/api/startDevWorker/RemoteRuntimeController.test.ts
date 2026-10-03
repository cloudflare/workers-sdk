import { APIError } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { RemoteRuntimeController } from "../../../api/startDevWorker/RemoteRuntimeController";
import { PREVIEW_TOKEN_REFRESH_RETRY_INTERVAL } from "../../../api/startDevWorker/utils";
// Import the mocked functions so we can set their behavior
import {
	createPreviewSession,
	createWorkerPreview,
} from "../../../dev/create-worker-preview";
import {
	createRemoteWorkerInit,
	getWorkerAccountAndContext,
	handlePreviewSessionCreationError,
	handlePreviewSessionUploadError,
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
			exports: undefined,
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

	describe("stale bundle bail-out", () => {
		it("should skip stale bundles and only reload once for rapid updates", async ({
			expect,
		}) => {
			const { controller, bus } = setup();
			const config = makeConfig();
			const bundle = makeBundle();

			// Initial bundle
			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });
			await bus.waitFor("reloadComplete");

			// Record events before rapid updates
			const eventsBefore = bus.events.length;
			vi.mocked(createWorkerPreview).mockClear();

			// Fire many rapid updates
			for (let i = 0; i < 5; i++) {
				controller.onBundleStart({ type: "bundleStart", config });
				controller.onBundleComplete({
					type: "bundleComplete",
					config,
					bundle,
				});
			}

			// Wait for the final reloadComplete
			await bus.waitFor("reloadComplete");

			// Give stale bundles time to flush through the mutex
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Stale bundles should bail out early — only one reloadComplete
			const reloadCompleteEvents = bus.events
				.slice(eventsBefore)
				.filter((e) => e.type === "reloadComplete");
			expect(reloadCompleteEvents).toHaveLength(1);

			// The API should only be called once (for the winning bundle)
			expect(createWorkerPreview).toHaveBeenCalledTimes(1);
		});
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

		it("should keep retrying the proactive refresh after a transient failure, and recover once it succeeds", async ({
			expect,
		}) => {
			vi.useFakeTimers();

			const { controller, bus } = setup();
			const config = makeConfig();
			const bundle = makeBundle();

			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });
			await bus.waitFor("reloadComplete");

			// The next proactive refresh fails outright (e.g. the machine is
			// offline) — a non-retryable status keeps `retryOnAPIFailure` from
			// needing a real-time backoff wait fake timers wouldn't advance.
			vi.mocked(createPreviewSession).mockRejectedValueOnce(
				new APIError({
					text: "network unreachable",
					notes: [],
					status: 400,
					telemetryMessage: false,
				})
			);

			// Register both waiters before advancing, with a timeout larger than
			// the advance window, so neither races the refresh timers.
			const errorPromise = bus.waitFor("error", undefined, 60 * 60 * 1000);
			await vi.advanceTimersByTimeAsync(50 * 60 * 1000 + 1);
			const errorEvent = await errorPromise;
			expect(errorEvent).toMatchObject({
				type: "error",
				reason: "Error refreshing preview token",
			});

			// Connectivity returns before the next short-interval retry: it must
			// succeed and refresh the session with no restart required.
			vi.mocked(createPreviewSession).mockResolvedValue({
				value: "test-session-value",
				host: "test.workers.dev",
				name: "test",
			});
			const reloadPromise = bus.waitFor(
				"reloadComplete",
				undefined,
				60 * 60 * 1000
			);
			await vi.advanceTimersByTimeAsync(
				PREVIEW_TOKEN_REFRESH_RETRY_INTERVAL + 1
			);
			const reloadEvent = await reloadPromise;
			expect(reloadEvent.type).toBe("reloadComplete");
		});

		it("should also retry when only the token upload fails, since that failure never throws", async ({
			expect,
		}) => {
			vi.useFakeTimers();

			const { controller, bus } = setup();
			const config = makeConfig();
			const bundle = makeBundle();

			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });
			await bus.waitFor("reloadComplete");

			// `createPreviewSession` (the session step) keeps succeeding, but
			// `createWorkerPreview` (the token upload step) fails. `#previewToken`
			// handles this itself — reporting the error and returning `undefined`
			// rather than throwing — so `#updatePreviewToken` returns `false`
			// without an exception for `#refreshPreviewToken` to catch.
			// `handlePreviewSessionUploadError` is mocked to its default
			// `undefined` return, i.e. "don't restart the session".
			vi.mocked(createWorkerPreview).mockRejectedValue(
				new Error("upload failed")
			);

			const errorPromise = bus.waitFor("error", undefined, 60 * 60 * 1000);
			await vi.advanceTimersByTimeAsync(50 * 60 * 1000 + 1);
			const errorEvent = await errorPromise;
			expect(errorEvent).toMatchObject({
				type: "error",
				reason: "Failed to obtain a preview token",
			});

			// It must still keep retrying on the short interval rather than
			// silently giving up just because nothing threw.
			const secondErrorPromise = bus.waitFor(
				"error",
				undefined,
				60 * 60 * 1000
			);
			await vi.advanceTimersByTimeAsync(
				PREVIEW_TOKEN_REFRESH_RETRY_INTERVAL + 1
			);
			await secondErrorPromise;

			// Recovers once the upload succeeds again.
			vi.mocked(createWorkerPreview).mockResolvedValue({
				value: "test-preview-token",
				host: "test.workers.dev",
			});
			const reloadPromise = bus.waitFor(
				"reloadComplete",
				undefined,
				60 * 60 * 1000
			);
			await vi.advanceTimersByTimeAsync(
				PREVIEW_TOKEN_REFRESH_RETRY_INTERVAL + 1
			);
			const reloadEvent = await reloadPromise;
			expect(reloadEvent.type).toBe("reloadComplete");
		});

		it("should not retry a refresh that a concurrent rebuild aborted", async ({
			expect,
		}) => {
			vi.useFakeTimers();

			const { controller, bus } = setup();
			const config = makeConfig();
			const bundle = makeBundle();

			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });
			await bus.waitFor("reloadComplete");

			// Simulate the proactive refresh being in flight when a rebuild
			// starts: `createWorkerPreview` hangs until its abort signal fires,
			// exactly like the real network call would once `onBundleStart()`
			// aborts it. `#currentBundleId` only advances once that rebuild
			// *completes* (`onBundleComplete`), so at the moment of the abort it
			// still matches this refresh's captured `bundleId` — the fix must
			// tell an aborted attempt apart from a genuine failure some other
			// way.
			vi.mocked(createPreviewSession).mockClear();
			vi.mocked(createWorkerPreview).mockImplementation(
				(..._args: unknown[]) =>
					new Promise((_resolve, reject) => {
						const signal = _args[5] as AbortSignal;
						signal.addEventListener("abort", () => {
							const err = new Error("aborted");
							err.name = "AbortError";
							reject(err);
						});
					})
			);

			await vi.advanceTimersByTimeAsync(50 * 60 * 1000 + 1);
			controller.onBundleStart({ type: "bundleStart", config });
			await vi.advanceTimersByTimeAsync(0);

			// The abort must not be reported as an error, nor scheduled for
			// retry. `createPreviewSession` was already called once by this
			// point, for this refresh's own (unaborted) session step — the
			// assertion is that it does *not* climb further.
			expect(createPreviewSession).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(
				PREVIEW_TOKEN_REFRESH_RETRY_INTERVAL * 2
			);
			expect(createPreviewSession).toHaveBeenCalledTimes(1);

			// The rebuild itself completes normally afterwards, unaffected.
			vi.mocked(createWorkerPreview).mockResolvedValue({
				value: "test-preview-token",
				host: "test.workers.dev",
			});
			const reloadPromise = bus.waitFor(
				"reloadComplete",
				undefined,
				60 * 60 * 1000
			);
			controller.onBundleComplete({
				type: "bundleComplete",
				config,
				bundle: { ...bundle, path: "/virtual/index2.mjs" },
			});
			await reloadPromise;
		});

		it("should not recreate the refresh timer when a thrown error surfaces after a concurrent rebuild aborted it", async ({
			expect,
		}) => {
			vi.useFakeTimers();

			const { controller, bus } = setup();
			const config = makeConfig();
			const bundle = makeBundle();

			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });
			await bus.waitFor("reloadComplete");

			// The session step hangs so it's still in flight when
			// `onBundleStart()` aborts the controller. Rather than the abort
			// itself rejecting this call (already covered above), a *different*,
			// unrelated error surfaces afterwards — e.g. a concurrent
			// account/context lookup failure — while the signal happens to
			// already be aborted. `onBundleStart()` also clears the pending
			// refresh timer; a thrown, non-`AbortError` failure must not
			// recreate it for this now-superseded bundle.
			let rejectAccountContext!: (err: unknown) => void;
			vi.mocked(getWorkerAccountAndContext).mockImplementation(
				() =>
					new Promise((_resolve, reject) => {
						rejectAccountContext = reject;
					})
			);

			await vi.advanceTimersByTimeAsync(50 * 60 * 1000 + 1);
			controller.onBundleStart({ type: "bundleStart", config });
			rejectAccountContext(new Error("account lookup failed"));

			const errorEvent = await bus.waitFor("error", undefined, 60 * 60 * 1000);
			expect(errorEvent).toMatchObject({
				type: "error",
				reason: "Error refreshing preview token",
			});

			// The error is still reported, but must not resurrect a retry timer
			// for the superseded bundle.
			vi.mocked(getWorkerAccountAndContext).mockResolvedValue({
				workerAccount: {
					accountId: "test-account-id",
					apiToken: { apiToken: "test-token" },
				},
				workerContext: {
					env: undefined,
					zone: undefined,
					host: undefined,
					routes: undefined,
					sendMetrics: undefined,
				},
			});
			vi.mocked(createPreviewSession).mockClear();
			await vi.advanceTimersByTimeAsync(
				PREVIEW_TOKEN_REFRESH_RETRY_INTERVAL * 2
			);
			expect(createPreviewSession).not.toHaveBeenCalled();

			// The rebuild itself completes normally afterwards, unaffected.
			const reloadPromise = bus.waitFor(
				"reloadComplete",
				undefined,
				60 * 60 * 1000
			);
			controller.onBundleComplete({
				type: "bundleComplete",
				config,
				bundle: { ...bundle, path: "/virtual/index3.mjs" },
			});
			await reloadPromise;
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

	describe("authentication error handling", () => {
		/**
		 * Creates an APIError that simulates a Cloudflare API authentication failure.
		 *
		 * @param code - the Cloudflare API error code (e.g. 9106, 10000)
		 * @param noteText - the note text from the API response
		 * @returns an APIError with the specified code
		 */
		function makeAuthError(code: number, noteText: string): APIError {
			const error = new APIError({
				text: "A request to the Cloudflare API (/accounts/test/workers/scripts/test-worker/subdomain/edge-preview) failed.",
				notes: [{ text: noteText }],
				status: 400,
				telemetryMessage: false,
			});
			error.code = code;
			return error;
		}

		it("should call handlePreviewSessionCreationError when createPreviewSession throws a code 10000 auth error", async ({
			expect,
		}) => {
			const authError = makeAuthError(
				10000,
				"Authentication error [code: 10000]"
			);
			vi.mocked(createPreviewSession).mockRejectedValue(authError);

			const { controller, bus } = setup();
			const config = makeConfig();
			const bundle = makeBundle();

			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });

			const errorEvent = await bus.waitFor("error");

			expect(handlePreviewSessionCreationError).toHaveBeenCalledWith(
				authError,
				"test-account-id"
			);
			expect(errorEvent).toMatchObject({
				type: "error",
				reason: "Error reloading remote server",
				source: "RemoteRuntimeController",
			});
		});

		it("should call handlePreviewSessionCreationError when createPreviewSession throws a code 9106 auth error", async ({
			expect,
		}) => {
			const authError = makeAuthError(
				9106,
				"Authentication failed (status: 400) [code: 9106]"
			);
			vi.mocked(createPreviewSession).mockRejectedValue(authError);

			const { controller, bus } = setup();
			const config = makeConfig();
			const bundle = makeBundle();

			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });

			const errorEvent = await bus.waitFor("error");

			expect(handlePreviewSessionCreationError).toHaveBeenCalledWith(
				authError,
				"test-account-id"
			);
			expect(errorEvent).toMatchObject({
				type: "error",
				reason: "Error reloading remote server",
				source: "RemoteRuntimeController",
			});
		});

		it("should call handlePreviewSessionUploadError when createWorkerPreview throws a code 10000 auth error", async ({
			expect,
		}) => {
			const authError = makeAuthError(
				10000,
				"Authentication error [code: 10000]"
			);
			vi.mocked(createWorkerPreview).mockRejectedValue(authError);

			const { controller, bus } = setup();
			const config = makeConfig();
			const bundle = makeBundle();

			controller.onBundleStart({ type: "bundleStart", config });
			controller.onBundleComplete({ type: "bundleComplete", config, bundle });

			const errorEvent = await bus.waitFor("error");

			expect(handlePreviewSessionUploadError).toHaveBeenCalledWith(
				authError,
				"test-account-id"
			);
			expect(errorEvent).toMatchObject({
				type: "error",
				reason: "Failed to obtain a preview token",
				source: "RemoteRuntimeController",
			});
		});
	});
});
