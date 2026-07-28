import { APIError, UserError } from "@cloudflare/workers-utils";
import { describe, it, vi } from "vitest";
import { startRemoteProxySession } from "./start-remote-proxy-session";
import { RemoteSessionAuthenticationError } from "./utils/remote";
import type { RemoteBindingsLogger } from "./logger";
import type { ErrorEvent } from "./startDevWorker/events";

// The error that the mocked `DevEnv` emits asynchronously from `start()`.
const mockDevEnv = vi.hoisted(() => ({ error: undefined as unknown }));

// Replace `DevEnv` with a stub that never becomes ready and instead emits a
// configurable error event just after `start()`, so we can exercise the async
// error-handling path in `startRemoteProxySession` without any real Miniflare.
vi.mock("./startDevWorker/DevEnv", async () => {
	const { EventEmitter } = await import("node:events");
	class DevEnv extends EventEmitter {
		proxy = {
			// Never resolves — the startup race is always settled by the error event.
			localServerReady: { promise: new Promise<void>(() => {}) },
			ready: { promise: new Promise(() => {}) },
			runtimeMessageMutex: { drained: async () => {} },
		};
		constructor() {
			super();
			// Avoid Node's throw-on-unhandled-"error" behaviour.
			this.on("error", () => {});
		}
		start() {
			queueMicrotask(() => this.emit("error", mockDevEnv.error));
		}
		update() {}
		async teardown() {}
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

describe("startRemoteProxySession error handling", () => {
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
