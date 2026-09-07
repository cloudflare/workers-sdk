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
});
