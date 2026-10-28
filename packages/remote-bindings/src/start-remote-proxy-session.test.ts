import { APIError, UserError } from "@cloudflare/workers-utils";
import { afterEach, describe, it, vi } from "vitest";
import { startRemoteProxySession } from "./start-remote-proxy-session";
import { RemoteSessionAuthenticationError } from "./utils/remote";
import type { RemoteBindingsLogger } from "./logger";
import type { ErrorEvent } from "./startDevWorker/events";

// The error that the mocked `DevEnv` emits asynchronously from `start()`.
const mockDevEnv = vi.hoisted(() => ({
	error: undefined as unknown,
	startError: undefined as unknown,
	teardown: vi.fn(async () => {}),
}));

// Replace `DevEnv` with a configurable stub so we can exercise startup errors
// and cleanup without any real Miniflare.
vi.mock("./startDevWorker/DevEnv", async () => {
	const { EventEmitter } = await import("node:events");
	class DevEnv extends EventEmitter {
		proxy = {
			localServerReady: {
				// With an error configured, the error event settles startup instead.
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
		update() {}
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

describe("startRemoteProxySession error handling", () => {
	it("throws a UserError under Bun before starting the session", async ({
		expect,
		onTestFinished,
	}) => {
		const originalBunVersion = process.versions.bun;
		process.versions.bun = "1.4.4";
		onTestFinished(() => {
			process.versions.bun = originalBunVersion;
		});

		const thrown = await startRemoteProxySession(
			{},
			{ cliDisplayName: "Test CLI", logger: createTestLogger() }
		).catch((error: unknown) => error);

		expect(thrown).toBeInstanceOf(UserError);
		expect(thrown).toMatchObject({
			message: expect.stringContaining(
				"https://github.com/oven-sh/bun/issues/39247"
			),
			telemetryMessage: "remote proxy session under bun",
		});
	});

	afterEach(() => {
		mockDevEnv.error = undefined;
		mockDevEnv.startError = undefined;
		mockDevEnv.teardown.mockReset();
		mockDevEnv.teardown.mockResolvedValue(undefined);
	});

	it("disposes only once even when teardown rejects", async ({ expect }) => {
		const error = new Error("cleanup failure");
		mockDevEnv.teardown.mockRejectedValueOnce(error);
		const session = await startRemoteProxySession(
			{},
			{ cliDisplayName: "Test CLI", logger: createTestLogger() }
		);
		const first = session.dispose();
		const second = session.dispose();
		expect(second).toBe(first);
		await expect(first).rejects.toBe(error);
		expect(session.dispose()).toBe(first);
		expect(mockDevEnv.teardown).toHaveBeenCalledOnce();
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
				startRemoteProxySession(
					{},
					{ cliDisplayName: "Test CLI", logger: createTestLogger() }
				)
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
