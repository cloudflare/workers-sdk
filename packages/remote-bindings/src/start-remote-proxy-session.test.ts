import { APIError, UserError } from "@cloudflare/workers-utils";
import { beforeEach, describe, it, vi } from "vitest";
import { startRemoteProxySession } from "./start-remote-proxy-session";
import { RemoteSessionAuthenticationError } from "./utils/remote";
import type { RemoteBindingsLogger } from "./logger";
import type { ErrorEvent } from "./startDevWorker/events";

// How the mocked `DevEnv` behaves. With `ready` false (the default), it never
// becomes ready and emits `error` just after `start()`. With `ready` true, the
// local server and proxy come up, and the `play` message is delivered unless
// `playError` is set, in which case it fails the way a real failed send looks
// from outside: `latestSendError` is set and `latestReloadCompleteMessage`
// resolves to false, with no error event (DevEnv only logs send failures).
// `lateError` instead leaves `play` pending and emits that error once the local
// server is ready. `updatePlayError` makes the `play` sent by `update()` fail.
const mockDevEnv = vi.hoisted(() => ({
	error: undefined as unknown,
	ready: false,
	playError: undefined as Error | undefined,
	lateError: undefined as unknown,
	updatePlayError: undefined as Error | undefined,
}));

const { isBunMock } = vi.hoisted(() => ({ isBunMock: vi.fn(() => false) }));
vi.mock("./utils/is-bun", () => ({ isBun: isBunMock }));

const PROXY_URL = "http://127.0.0.1:8787/";

// Replace `DevEnv` with a stub, so we can exercise `startRemoteProxySession`'s
// startup paths without any real Miniflare.
vi.mock("./startDevWorker/DevEnv", async () => {
	const { EventEmitter } = await import("node:events");
	type MockProxy = {
		latestReloadCompleteMessage: Promise<boolean>;
		latestSendError?: Error;
		[key: string]: unknown;
	};
	// A `play` that fails with `error`, recorded the way ProxyController records
	// a send that ran out of retries.
	const failedPlay = (proxy: MockProxy, error: Error) =>
		new Promise<boolean>((resolve) =>
			queueMicrotask(() => {
				proxy.latestSendError = error;
				resolve(false);
			})
		);
	class DevEnv extends EventEmitter {
		proxy: MockProxy = mockDevEnv.ready
			? {
					localServerReady: { promise: Promise.resolve() },
					ready: { promise: Promise.resolve({ url: new URL(PROXY_URL) }) },
					latestReloadCompleteMessage: Promise.resolve(true),
					runtimeMessageMutex: { drained: async () => {} },
				}
			: {
					// Never resolves — the startup race is always settled by the error event.
					localServerReady: { promise: new Promise<void>(() => {}) },
					ready: { promise: new Promise(() => {}) },
					latestReloadCompleteMessage: new Promise<boolean>(() => {}),
					runtimeMessageMutex: { drained: async () => {} },
				};
		constructor() {
			super();
			// Avoid Node's throw-on-unhandled-"error" behaviour.
			this.on("error", () => {});
			if (mockDevEnv.ready && mockDevEnv.playError !== undefined) {
				this.proxy.latestReloadCompleteMessage = failedPlay(
					this.proxy,
					mockDevEnv.playError
				);
			} else if (mockDevEnv.ready && mockDevEnv.lateError !== undefined) {
				this.proxy.latestReloadCompleteMessage = new Promise<boolean>(() => {});
			}
		}
		start() {
			if (!mockDevEnv.ready) {
				queueMicrotask(() => this.emit("error", mockDevEnv.error));
			} else if (mockDevEnv.lateError !== undefined) {
				setTimeout(() => this.emit("error", mockDevEnv.lateError), 0);
			}
		}
		update() {
			if (mockDevEnv.updatePlayError !== undefined) {
				this.proxy.latestReloadCompleteMessage = failedPlay(
					this.proxy,
					mockDevEnv.updatePlayError
				);
			}
			queueMicrotask(() => this.emit("reloadComplete", {}));
		}
		async teardown() {}
	}
	return { DevEnv };
});

beforeEach(() => {
	mockDevEnv.error = undefined;
	mockDevEnv.ready = false;
	mockDevEnv.playError = undefined;
	mockDevEnv.lateError = undefined;
	mockDevEnv.updatePlayError = undefined;
	isBunMock.mockReturnValue(false);
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
			startRemoteProxySession(
				{},
				{ cliDisplayName: "Test CLI", logger: createTestLogger() }
			)
		).rejects.toBe(userError);
	});

	it("unwraps a UserError nested in an error event's cause", async ({
		expect,
	}) => {
		const authError = new RemoteSessionAuthenticationError(new Error("401"));
		mockDevEnv.error = makeErrorEvent(authError);

		const thrown = await startRemoteProxySession(
			{},
			{ cliDisplayName: "Test CLI", logger: createTestLogger() }
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
			{ cliDisplayName: "Test CLI", logger: createTestLogger() }
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
			{ cliDisplayName: "Test CLI", logger: createTestLogger() }
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

describe("startRemoteProxySession waits for the play message", () => {
	// The ProxyWorker queues every binding request until `play` hands it the
	// remote session. Under Bun that message never arrives, because Bun's
	// `fetch()` ignores the undici `dispatcher` Miniflare routes it through
	// (https://github.com/oven-sh/bun/issues/39247), so a session reported as
	// ready would leave every remote binding call waiting forever.
	const sendFailure = () => new Error("getaddrinfo ENOTFOUND dummy");

	it("resolves once play is delivered", async ({ expect }) => {
		mockDevEnv.ready = true;

		const session = await startRemoteProxySession(
			{},
			{ cliDisplayName: "Test CLI", logger: createTestLogger() }
		);

		expect(String(session.remoteProxyConnectionString)).toBe(PROXY_URL);
	});

	it("rejects instead of hanging when play is never delivered", async ({
		expect,
	}) => {
		mockDevEnv.ready = true;
		mockDevEnv.playError = sendFailure();

		const thrown = await startRemoteProxySession(
			{},
			{ cliDisplayName: "Test CLI", logger: createTestLogger() }
		).catch((error: unknown) => error);

		expect(thrown).toBeInstanceOf(Error);
		expect(thrown).not.toBeInstanceOf(UserError);
		expect((thrown as Error).message).toContain(
			"Failed to start the remote proxy session"
		);
		expect((thrown as Error).message).toContain("ENOTFOUND dummy");
	});

	it("names the Bun limitation when play is never delivered under Bun", async ({
		expect,
	}) => {
		isBunMock.mockReturnValue(true);
		mockDevEnv.ready = true;
		mockDevEnv.playError = sendFailure();

		const thrown = await startRemoteProxySession(
			{},
			{ cliDisplayName: "Test CLI", logger: createTestLogger() }
		).catch((error: unknown) => error);

		expect(thrown).toBeInstanceOf(UserError);
		expect((thrown as Error).message).toContain(
			"https://github.com/oven-sh/bun/issues/39247"
		);
		expect((thrown as Error).cause).toBe(mockDevEnv.playError);
	});

	it("reports a separate startup error as itself while play is pending under Bun", async ({
		expect,
	}) => {
		isBunMock.mockReturnValue(true);
		mockDevEnv.ready = true;
		const authError = new RemoteSessionAuthenticationError("Not logged in");
		mockDevEnv.lateError = makeErrorEvent(authError);

		const thrown = await startRemoteProxySession(
			{},
			{ cliDisplayName: "Test CLI", logger: createTestLogger() }
		).catch((error: unknown) => error);

		expect(thrown).toBe(authError);
	});

	it("rejects updateBindings when the new play is never delivered", async ({
		expect,
	}) => {
		mockDevEnv.ready = true;
		const session = await startRemoteProxySession(
			{},
			{ cliDisplayName: "Test CLI", logger: createTestLogger() }
		);
		mockDevEnv.updatePlayError = sendFailure();

		await expect(session.updateBindings({})).rejects.toThrow("ENOTFOUND dummy");
	});
});
