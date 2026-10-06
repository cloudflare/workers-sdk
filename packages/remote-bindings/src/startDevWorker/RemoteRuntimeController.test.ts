import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { initLogger } from "../logger";
import { PREVIEW_TOKEN_REFRESH_RETRY_INTERVAL } from "./utils";
import type {
	CfPreviewSession,
	CfPreviewToken,
} from "../utils/create-worker-preview";
import type { ErrorEvent, ReloadCompleteEvent } from "./events";
import type { Bundle, StartDevWorkerOptions } from "./types";

initLogger({
	loggerLevel: "none",
	debug: vi.fn(),
	log: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	console: vi.fn(),
});

const { createPreviewSession, createWorkerPreview } = vi.hoisted(() => ({
	createPreviewSession: vi.fn<() => Promise<CfPreviewSession>>(),
	createWorkerPreview: vi.fn<() => Promise<CfPreviewToken>>(),
}));

vi.mock("../utils/create-worker-preview", () => ({
	createPreviewSession,
	createWorkerPreview,
}));

vi.mock("@cloudflare/workers-auth", () => ({
	getAccessHeaders: vi.fn().mockResolvedValue({}),
}));

const { RemoteRuntimeController } = await import("./RemoteRuntimeController");

const config: StartDevWorkerOptions = {
	name: "remote-bindings-proxy",
	entrypointSource: "export default {};",
	bindings: {},
	compatibilityDate: "2026-07-17",
	compatibilityFlags: [],
	complianceRegion: undefined,
	auth: () => ({
		accountId: "account-id",
		apiToken: { apiToken: "api-token" },
	}),
	server: { port: 0, secure: false },
};

const bundle: Bundle = {
	path: "/tmp/worker.js",
	entrypointSource: "export default {};",
	type: "esm",
	modules: [],
};

const session: CfPreviewSession = {
	value: "session-token",
	host: "example.workers.dev",
};
const token: CfPreviewToken = {
	value: "preview-token",
	host: "example.workers.dev",
	tailUrl: "wss://example.workers.dev/tail",
};

describe("RemoteRuntimeController preview token refresh", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		createPreviewSession.mockReset();
		createWorkerPreview.mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("refreshes on the session deadline despite an update", async ({
		expect,
	}) => {
		createPreviewSession.mockResolvedValue(session);
		createWorkerPreview.mockResolvedValue(token);
		const onReloadComplete = vi.fn<(event: ReloadCompleteEvent) => void>();
		const controller = new RemoteRuntimeController(vi.fn(), onReloadComplete);

		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		await vi.advanceTimersByTimeAsync(0);
		expect(onReloadComplete).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
		controller.onUpdateStart();
		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		await vi.advanceTimersByTimeAsync(0);
		expect(onReloadComplete).toHaveBeenCalledTimes(2);

		createWorkerPreview.mockClear();
		await vi.advanceTimersByTimeAsync(20 * 60 * 1000 + 1);
		expect(onReloadComplete).toHaveBeenCalledTimes(3);
		expect(createWorkerPreview).toHaveBeenCalledTimes(1);
		expect(createPreviewSession).toHaveBeenCalledTimes(2);
		await controller.teardown();
	});

	it("retains the refresh timer when an update fails", async ({ expect }) => {
		createPreviewSession.mockResolvedValue(session);
		createWorkerPreview.mockResolvedValue(token);
		const onReloadComplete = vi.fn<(event: ReloadCompleteEvent) => void>();
		const controller = new RemoteRuntimeController(vi.fn(), onReloadComplete);

		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		await vi.advanceTimersByTimeAsync(0);
		expect(onReloadComplete).toHaveBeenCalledTimes(1);

		controller.onUpdateStart();
		await vi.advanceTimersByTimeAsync(50 * 60 * 1000 + 1);
		expect(onReloadComplete).toHaveBeenCalledTimes(2);
		await controller.teardown();
	});

	it("keeps retrying on an interval after a failed refresh, and recovers once it succeeds", async ({
		expect,
	}) => {
		createPreviewSession.mockResolvedValue(session);
		createWorkerPreview.mockResolvedValue(token);

		const onError = vi.fn<(event: ErrorEvent) => void>();
		const onReloadComplete = vi.fn<(event: ReloadCompleteEvent) => void>();
		const controller = new RemoteRuntimeController(onError, onReloadComplete);

		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		await vi.advanceTimersByTimeAsync(0);
		expect(onReloadComplete).toHaveBeenCalledTimes(1);

		// The next scheduled refresh (50 minutes out) fails, simulating the
		// machine being offline. A plain (non-`TypeError`, non-`APIError`)
		// rejection makes the underlying `retryOnAPIFailure` throw immediately
		// instead of retrying with its own real-time backoff, which fake timers
		// don't advance — keeping this test deterministic without needing to
		// also simulate that unrelated, pre-existing retry loop.
		createPreviewSession.mockRejectedValue(new Error("network unreachable"));
		await vi.advanceTimersByTimeAsync(50 * 60 * 1000);
		expect(onError).toHaveBeenCalledTimes(1);
		// Still only the one successful reload so far.
		expect(onReloadComplete).toHaveBeenCalledTimes(1);

		// Connectivity is still down for a while: it must keep retrying on the
		// short interval rather than giving up after the first failure.
		await vi.advanceTimersByTimeAsync(PREVIEW_TOKEN_REFRESH_RETRY_INTERVAL * 3);
		expect(onError).toHaveBeenCalledTimes(4);
		expect(onReloadComplete).toHaveBeenCalledTimes(1);

		// Connectivity returns: the next retry on the short interval must
		// succeed and refresh the session, with no restart required.
		createPreviewSession.mockResolvedValue(session);
		createWorkerPreview.mockResolvedValue(token);
		await vi.advanceTimersByTimeAsync(PREVIEW_TOKEN_REFRESH_RETRY_INTERVAL);
		expect(onReloadComplete).toHaveBeenCalledTimes(2);

		await controller.teardown();
	});

	it("also retries when only the token upload fails, since that failure never throws", async ({
		expect,
	}) => {
		createPreviewSession.mockResolvedValue(session);
		createWorkerPreview.mockResolvedValue(token);

		const onError = vi.fn<(event: ErrorEvent) => void>();
		const onReloadComplete = vi.fn<(event: ReloadCompleteEvent) => void>();
		const controller = new RemoteRuntimeController(onError, onReloadComplete);

		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		await vi.advanceTimersByTimeAsync(0);
		expect(onReloadComplete).toHaveBeenCalledTimes(1);

		// `createPreviewSession` (the session step) keeps succeeding, but
		// `createWorkerPreview` (the token upload step) fails. `#previewToken`
		// handles this itself — it reports the error and returns `undefined`
		// rather than throwing — so `#updatePreviewToken` returns `false`
		// without an exception for `#refreshPreviewToken` to catch.
		createWorkerPreview.mockRejectedValue(new Error("upload failed"));
		await vi.advanceTimersByTimeAsync(50 * 60 * 1000);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onReloadComplete).toHaveBeenCalledTimes(1);

		// It must still keep retrying on the short interval rather than
		// silently giving up just because nothing threw.
		await vi.advanceTimersByTimeAsync(PREVIEW_TOKEN_REFRESH_RETRY_INTERVAL * 2);
		expect(onError).toHaveBeenCalledTimes(3);
		expect(onReloadComplete).toHaveBeenCalledTimes(1);

		// Recovers once the upload succeeds again.
		createWorkerPreview.mockResolvedValue(token);
		await vi.advanceTimersByTimeAsync(PREVIEW_TOKEN_REFRESH_RETRY_INTERVAL);
		expect(onReloadComplete).toHaveBeenCalledTimes(2);

		await controller.teardown();
	});

	it("does not retry a refresh that a concurrent rebuild aborted", async ({
		expect,
	}) => {
		createPreviewSession.mockResolvedValue(session);
		createWorkerPreview.mockResolvedValue(token);

		const onError = vi.fn<(event: ErrorEvent) => void>();
		const onReloadComplete = vi.fn<(event: ReloadCompleteEvent) => void>();
		const controller = new RemoteRuntimeController(onError, onReloadComplete);

		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		await vi.advanceTimersByTimeAsync(0);
		expect(onReloadComplete).toHaveBeenCalledTimes(1);

		// Simulate the proactive refresh being in flight when a rebuild starts:
		// `createWorkerPreview` hangs until its abort signal fires, exactly
		// like the real network call would once `onUpdateStart()` aborts it.
		// `#currentBundleId` only advances once that rebuild *completes*
		// (`onBundleComplete`), so at the moment of the abort it still matches
		// this refresh's captured `bundleId` — the fix must tell an aborted
		// attempt apart from a genuine failure some other way.
		createWorkerPreview.mockImplementation(
			(..._args: unknown[]) =>
				new Promise((_resolve, reject) => {
					const signal = _args[4] as AbortSignal;
					signal.addEventListener("abort", () => {
						const err = new Error("aborted");
						err.name = "AbortError";
						reject(err);
					});
				})
		);

		await vi.advanceTimersByTimeAsync(50 * 60 * 1000);
		controller.onUpdateStart();
		await vi.advanceTimersByTimeAsync(0);

		expect(onError).not.toHaveBeenCalled();
		expect(createPreviewSession).toHaveBeenCalledTimes(2);
		expect(onReloadComplete).toHaveBeenCalledTimes(1);

		createWorkerPreview.mockResolvedValue(token);
		const newBundle: Bundle = { ...bundle, path: "/tmp/worker-2.js" };
		controller.onBundleComplete({
			type: "bundleComplete",
			config,
			bundle: newBundle,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(onReloadComplete).toHaveBeenCalledTimes(2);
		const sessionCount = createPreviewSession.mock.calls.length;
		await vi.advanceTimersByTimeAsync(PREVIEW_TOKEN_REFRESH_RETRY_INTERVAL * 2);
		expect(createPreviewSession).toHaveBeenCalledTimes(sessionCount);

		await controller.teardown();
	});

	it("retries after an aborted refresh when the rebuild never completes", async ({
		expect,
	}) => {
		createPreviewSession.mockResolvedValue(session);
		createWorkerPreview.mockResolvedValue(token);
		const onError = vi.fn<(event: ErrorEvent) => void>();
		const onReloadComplete = vi.fn<(event: ReloadCompleteEvent) => void>();
		const controller = new RemoteRuntimeController(onError, onReloadComplete);

		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		await vi.advanceTimersByTimeAsync(0);

		createWorkerPreview.mockImplementationOnce(
			(...args: unknown[]) =>
				new Promise((_resolve, reject) => {
					const signal = args[4] as AbortSignal;
					signal.addEventListener("abort", () => {
						reject(new DOMException("aborted", "AbortError"));
					});
				})
		);
		await vi.advanceTimersByTimeAsync(50 * 60 * 1000);
		controller.onUpdateStart();
		await vi.advanceTimersByTimeAsync(0);
		expect(onReloadComplete).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(PREVIEW_TOKEN_REFRESH_RETRY_INTERVAL);
		expect(onError).not.toHaveBeenCalled();
		expect(onReloadComplete).toHaveBeenCalledTimes(2);
		expect(onReloadComplete).toHaveBeenLastCalledWith(
			expect.objectContaining({ bundle })
		);
		await controller.teardown();
	});

	it("does not recreate the refresh timer when a thrown error surfaces after a concurrent rebuild aborted it", async ({
		expect,
	}) => {
		createPreviewSession.mockResolvedValue(session);
		createWorkerPreview.mockResolvedValue(token);

		const onError = vi.fn<(event: ErrorEvent) => void>();
		const onReloadComplete = vi.fn<(event: ReloadCompleteEvent) => void>();
		const controller = new RemoteRuntimeController(onError, onReloadComplete);

		controller.onBundleComplete({ type: "bundleComplete", config, bundle });
		await vi.advanceTimersByTimeAsync(0);
		expect(onReloadComplete).toHaveBeenCalledTimes(1);

		// The session step hangs so it's still in flight when `onUpdateStart()`
		// aborts the controller. Rather than the abort itself rejecting this
		// call (already covered above), a *different*, unrelated error surfaces
		// afterwards — e.g. a concurrent auth-hook failure — while the signal
		// happens to already be aborted. A thrown, non-`AbortError` failure
		// must not retry the aborted refresh.
		let rejectSession!: (err: unknown) => void;
		createPreviewSession.mockImplementation(
			() =>
				new Promise((_resolve, reject) => {
					rejectSession = reject;
				})
		);

		await vi.advanceTimersByTimeAsync(50 * 60 * 1000);
		controller.onUpdateStart();
		rejectSession(new Error("auth hook failed"));
		await vi.advanceTimersByTimeAsync(0);

		expect(onError).toHaveBeenCalledTimes(1);
		expect(createPreviewSession).toHaveBeenCalledTimes(2);
		expect(onReloadComplete).toHaveBeenCalledTimes(1);

		createPreviewSession.mockResolvedValue(session);
		createWorkerPreview.mockResolvedValue(token);
		const newBundle: Bundle = { ...bundle, path: "/tmp/worker-3.js" };
		controller.onBundleComplete({
			type: "bundleComplete",
			config,
			bundle: newBundle,
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(onReloadComplete).toHaveBeenCalledTimes(3);
		expect(onReloadComplete).toHaveBeenLastCalledWith(
			expect.objectContaining({ bundle: newBundle })
		);
		const sessionCount = createPreviewSession.mock.calls.length;
		await vi.advanceTimersByTimeAsync(PREVIEW_TOKEN_REFRESH_RETRY_INTERVAL * 2);
		expect(createPreviewSession).toHaveBeenCalledTimes(sessionCount);

		await controller.teardown();
	});
});
