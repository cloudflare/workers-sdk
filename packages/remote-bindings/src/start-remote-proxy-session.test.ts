import { APIError, UserError } from "@cloudflare/workers-utils";
import { afterEach, describe, it, vi } from "vitest";
import * as seedHyperdriveBindings from "./seed-hyperdrive-bindings";
import {
	HYPERDRIVE_KEEPALIVE_INTERVAL_MS,
	startRemoteProxySession,
} from "./start-remote-proxy-session";
import { RemoteSessionAuthenticationError } from "./utils/remote";
import type { RemoteBindingsLogger } from "./logger";
import type { ErrorEvent } from "./startDevWorker/events";

// The error that the mocked `DevEnv` emits asynchronously from `start()`.
const mockDevEnv = vi.hoisted(() => ({
	error: undefined as unknown,
	startError: undefined as unknown,
	reloadError: undefined as unknown,
	teardown: vi.fn(async () => {}),
}));

// Replace `DevEnv` with a stub that never becomes ready and instead emits a
// configurable error event just after `start()`, so we can exercise the async
// error-handling path in `startRemoteProxySession` without any real Miniflare.
vi.mock("./startDevWorker/DevEnv", async () => {
	const { EventEmitter } = await import("node:events");
	class DevEnv extends EventEmitter {
		proxy = {
			localServerReady: {
				promise:
					mockDevEnv.error === undefined
						? Promise.resolve()
						: new Promise<void>(() => {}),
			},
			ready: {
				promise: Promise.resolve({ url: new URL("http://localhost:8787") }),
			},
			runtimeMessageMutex: { drained: async () => {} },
		};
		constructor() {
			super();
			// Avoid Node's throw-on-unhandled-"error" behaviour.
			this.on("error", () => {});
		}
		start() {
			if (mockDevEnv.startError !== undefined) {
				throw mockDevEnv.startError;
			}
			if (mockDevEnv.error !== undefined) {
				queueMicrotask(() => this.emit("error", mockDevEnv.error));
			}
		}
		update() {
			queueMicrotask(() => {
				if (mockDevEnv.reloadError !== undefined) {
					this.emit("error", mockDevEnv.reloadError);
				} else {
					this.emit("reloadComplete");
				}
			});
		}
		teardown = mockDevEnv.teardown;
	}
	return { DevEnv };
});

function createTestLogger(): RemoteBindingsLogger {
	return {
		loggerLevel: "none",
		debug: vi.fn(),
		log: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		console: vi.fn(),
	};
}

function makeErrorEvent(cause: ErrorEvent["cause"]): ErrorEvent {
	return {
		type: "error",
		reason: "Failed to start ProxyWorker",
		cause,
		source: "RemoteRuntimeController",
		data: undefined,
	};
}

describe("session-owned Hyperdrive keepalive", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		mockDevEnv.error = undefined;
		mockDevEnv.reloadError = undefined;
	});

	it("starts explicitly, retargets after update, removes, re-adds, and stops on dispose", async ({
		expect,
	}) => {
		vi.useFakeTimers();
		mockDevEnv.error = undefined;
		const seed = vi
			.spyOn(seedHyperdriveBindings, "seedRemoteHyperdriveBindings")
			.mockResolvedValue(new Map());
		const initial = {
			HD: { type: "hyperdrive" as const, id: "initial", remote: true },
		};
		const renamed = {
			RENAMED: { type: "hyperdrive" as const, id: "changed", remote: true },
		};
		mockDevEnv.teardown.mockClear();
		const session = await startRemoteProxySession(initial, {
			logger: createTestLogger(),
		});
		expect(vi.getTimerCount()).toBe(0);
		session.updateHyperdriveKeepalive(initial);
		session.updateHyperdriveKeepalive(initial);
		expect(vi.getTimerCount()).toBe(1);
		await session.updateBindings(renamed);
		await vi.advanceTimersByTimeAsync(HYPERDRIVE_KEEPALIVE_INTERVAL_MS);
		expect(seed).toHaveBeenCalledExactlyOnceWith(
			renamed,
			session.remoteProxyConnectionString
		);
		await session.updateBindings({});
		expect(vi.getTimerCount()).toBe(0);
		await session.updateBindings(initial);
		expect(vi.getTimerCount()).toBe(1);
		await session.dispose();
		session.updateHyperdriveKeepalive(initial);
		await session.updateBindings(initial);
		await session.dispose();
		expect(mockDevEnv.teardown).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
		await vi.advanceTimersByTimeAsync(HYPERDRIVE_KEEPALIVE_INTERVAL_MS);
		expect(seed).toHaveBeenCalledOnce();
	});

	it("keeps the committed targets when reload fails and does not log seed secrets", async ({
		expect,
	}) => {
		vi.useFakeTimers();
		mockDevEnv.error = undefined;
		const logger = createTestLogger();
		const seed = vi
			.spyOn(seedHyperdriveBindings, "seedRemoteHyperdriveBindings")
			.mockRejectedValue(new Error("private-test-secret"));
		const initial = {
			HD: { type: "hyperdrive" as const, id: "initial", remote: true },
		};
		const session = await startRemoteProxySession(initial, { logger });
		session.updateHyperdriveKeepalive(initial);
		mockDevEnv.reloadError = new Error("reload failed");
		await expect(session.updateBindings({})).rejects.toThrow("reload failed");
		await vi.advanceTimersByTimeAsync(HYPERDRIVE_KEEPALIVE_INTERVAL_MS);
		expect(seed).toHaveBeenCalledExactlyOnceWith(
			initial,
			session.remoteProxyConnectionString
		);
		expect(JSON.stringify(vi.mocked(logger.debug).mock.calls)).not.toContain(
			"private-test-secret"
		);
		expect(vi.getTimerCount()).toBe(1);
		await session.dispose();
	});
});

describe("startRemoteProxySession error handling", () => {
	afterEach(() => {
		mockDevEnv.startError = undefined;
		mockDevEnv.teardown.mockReset();
		mockDevEnv.teardown.mockResolvedValue(undefined);
	});

	it.for(["start", "async"])(
		"preserves the %s startup error when cleanup fails",
		async (stage, { expect }) => {
			const original = new UserError("original startup failure", {
				telemetryMessage: "test startup error",
			});
			if (stage === "start") {
				mockDevEnv.startError = original;
			} else {
				mockDevEnv.error = original;
			}
			mockDevEnv.teardown.mockRejectedValueOnce(new Error("cleanup failure"));
			await expect(
				startRemoteProxySession({}, { logger: createTestLogger() })
			).rejects.toBe(original);
			expect(mockDevEnv.teardown).toHaveBeenCalledOnce();
		}
	);
	// Regression: a `UserError` emitted asynchronously (e.g. the Miniflare
	// user-error case in `DevEnv.handleErrorEvent`) used to fall through to being
	// wrapped in a generic `Error`, which makes Wrangler treat it as an
	// unexpected internal error (bug prompt + Sentry report) rather than a clean
	// user-facing error.
	it("re-throws a UserError emitted asynchronously without wrapping it", async ({
		expect,
	}) => {
		const userError = new UserError("nodejs_compat is required", {
			telemetryMessage: "test user error",
		});
		mockDevEnv.error = userError;

		await expect(
			startRemoteProxySession({}, { logger: createTestLogger() })
		).rejects.toBe(userError);
	});

	it("unwraps a UserError nested in an error event's cause", async ({
		expect,
	}) => {
		const authError = new RemoteSessionAuthenticationError(new Error("401"));
		mockDevEnv.error = makeErrorEvent(authError);

		const thrown = await startRemoteProxySession(
			{},
			{ logger: createTestLogger() }
		).catch((error: unknown) => error);

		expect(thrown).toBe(authError);
		expect(thrown).toBeInstanceOf(UserError);
	});

	it("wraps a non-user error in a generic Error, preserving the message", async ({
		expect,
	}) => {
		mockDevEnv.error = makeErrorEvent(new Error("boom"));

		const thrown = await startRemoteProxySession(
			{},
			{ logger: createTestLogger() }
		).catch((error: unknown) => error);

		expect(thrown).toBeInstanceOf(Error);
		expect(thrown).not.toBeInstanceOf(UserError);
		expect((thrown as Error).message).toContain(
			"Failed to start the remote proxy session"
		);
		expect((thrown as Error).message).toContain("boom");
	});

	// `APIError` extends `UserError` (via `ParseError`), but a generic API
	// failure during preview-token creation must still be wrapped in the
	// "Failed to start the remote proxy session" envelope — not re-thrown raw —
	// so only `RemoteSessionAuthenticationError` is unwrapped from the cause
	// chain. Regression guard for the too-broad `UserError` walk.
	it("wraps a generic APIError from the cause chain rather than re-throwing it", async ({
		expect,
	}) => {
		mockDevEnv.error = makeErrorEvent(
			new APIError({
				text: "The remote worker preview failed.",
				telemetryMessage: "test api error",
			})
		);

		const thrown = await startRemoteProxySession(
			{},
			{ logger: createTestLogger() }
		).catch((error: unknown) => error);

		expect(thrown).not.toBeInstanceOf(APIError);
		expect((thrown as Error).message).toContain(
			"Failed to start the remote proxy session"
		);
		expect((thrown as Error).message).toContain(
			"The remote worker preview failed."
		);
	});
});
