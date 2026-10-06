import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	HYPERDRIVE_KEEPALIVE_INTERVAL_MS,
	maybeStartOrUpdateRemoteProxySession,
	pickRemoteBindings,
} from "./maybe-start-or-update-session";
import * as seedHyperdriveBindings from "./seed-hyperdrive-bindings";
import type { RemoteBindingsLogger } from "./logger";
import type { RemoteProxySessionData } from "./maybe-start-or-update-session";
import type { startRemoteProxySession } from "./start-remote-proxy-session";
import type { RemoteProxyConnectionString } from "miniflare";

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

describe("maybeStartOrUpdateRemoteProxySession", () => {
	it.for([undefined, true])(
		"selects K2 bindings for remote development with remote=%s",
		(remote, { expect }) => {
			const binding = {
				type: "k2" as const,
				stream: "0123456789abcdef0123456789abcdef",
				...(remote === undefined ? {} : { remote }),
			};
			expect(pickRemoteBindings({ ORDERS: binding })).toEqual({
				ORDERS: binding,
			});
		}
	);

	it("updates an existing session when all remote bindings are removed", async ({
		expect,
	}) => {
		const dispose = vi.fn();
		const updateBindings = vi.fn();
		const startSession = vi.fn<typeof startRemoteProxySession>();
		const existingSession: RemoteProxySessionData = {
			session: {
				ready: Promise.resolve(),
				dispose,
				updateBindings,
				remoteProxyConnectionString: new URL(
					"http://localhost:8787"
				) as RemoteProxyConnectionString,
			},
			remoteBindings: {
				SERVICE: {
					type: "service",
					service: "worker",
					remote: true,
				},
			},
			hyperdriveConnectionStrings: new Map(),
		};

		const result = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: {} },
			existingSession,
			undefined,
			{ logger: createTestLogger() },
			startSession
		);

		expect(result?.session).toBe(existingSession.session);
		expect(updateBindings).toHaveBeenCalledWith({});
		expect(dispose).not.toHaveBeenCalled();
		expect(startSession).not.toHaveBeenCalled();
	});

	it("does not start a session without remote bindings", async ({ expect }) => {
		const startSession = vi.fn<typeof startRemoteProxySession>();

		const result = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: {} },
			undefined,
			undefined,
			{ logger: createTestLogger() },
			startSession
		);

		expect(result).toBeNull();
		expect(startSession).not.toHaveBeenCalled();
	});
});

describe("Hyperdrive credential keepalive", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function hyperdriveBindings() {
		return {
			HYPERDRIVE: {
				type: "hyperdrive" as const,
				id: "some-id",
				remote: true,
			},
		};
	}

	it("re-seeds credentials on an interval for a session with remote Hyperdrive bindings", async ({
		expect,
	}) => {
		const seedSpy = vi
			.spyOn(seedHyperdriveBindings, "seedRemoteHyperdriveBindings")
			.mockResolvedValue(new Map());
		const startSession = vi
			.fn<typeof startRemoteProxySession>()
			.mockResolvedValue({
				ready: Promise.resolve(),
				dispose: vi.fn(),
				updateBindings: vi.fn(),
				remoteProxyConnectionString: new URL(
					"http://localhost:8787"
				) as RemoteProxyConnectionString,
			});

		await maybeStartOrUpdateRemoteProxySession(
			{ bindings: hyperdriveBindings() },
			undefined,
			undefined,
			{ logger: createTestLogger() },
			startSession
		);

		// One call from the initial seed in `maybeStartOrUpdateRemoteProxySession` itself.
		expect(seedSpy).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(HYPERDRIVE_KEEPALIVE_INTERVAL_MS);
		expect(seedSpy).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(HYPERDRIVE_KEEPALIVE_INTERVAL_MS);
		expect(seedSpy).toHaveBeenCalledTimes(3);
	});

	it("stops re-seeding once the session is disposed", async ({ expect }) => {
		const seedSpy = vi
			.spyOn(seedHyperdriveBindings, "seedRemoteHyperdriveBindings")
			.mockResolvedValue(new Map());
		const dispose = vi.fn().mockResolvedValue(undefined);
		const startSession = vi
			.fn<typeof startRemoteProxySession>()
			.mockResolvedValue({
				ready: Promise.resolve(),
				dispose,
				updateBindings: vi.fn(),
				remoteProxyConnectionString: new URL(
					"http://localhost:8787"
				) as RemoteProxyConnectionString,
			});

		const result = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: hyperdriveBindings() },
			undefined,
			undefined,
			{ logger: createTestLogger() },
			startSession
		);
		expect(seedSpy).toHaveBeenCalledTimes(1);

		await result?.session.dispose();
		expect(dispose).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(HYPERDRIVE_KEEPALIVE_INTERVAL_MS * 3);
		expect(seedSpy).toHaveBeenCalledTimes(1);
	});

	it("does not install a second keepalive when the same session is reused", async ({
		expect,
	}) => {
		const seedSpy = vi
			.spyOn(seedHyperdriveBindings, "seedRemoteHyperdriveBindings")
			.mockResolvedValue(new Map());
		const startSession = vi
			.fn<typeof startRemoteProxySession>()
			.mockResolvedValue({
				ready: Promise.resolve(),
				dispose: vi.fn(),
				updateBindings: vi.fn(),
				remoteProxyConnectionString: new URL(
					"http://localhost:8787"
				) as RemoteProxyConnectionString,
			});

		const first = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: hyperdriveBindings() },
			undefined,
			undefined,
			{ logger: createTestLogger() },
			startSession
		);
		const second = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: hyperdriveBindings() },
			first,
			undefined,
			{ logger: createTestLogger() },
			startSession
		);
		expect(second?.session).toBe(first?.session);

		await vi.advanceTimersByTimeAsync(HYPERDRIVE_KEEPALIVE_INTERVAL_MS);
		// 2 initial seeds (one per call above) + 1 keepalive tick, not 2.
		expect(seedSpy).toHaveBeenCalledTimes(3);
	});

	it("returns the session, degraded, when seeding fails", async ({
		expect,
	}) => {
		// A seed failure must not strand the session: it is shared with every
		// other remote binding, and a caller that never receives the handle can
		// neither use nor dispose it.
		vi.spyOn(
			seedHyperdriveBindings,
			"seedRemoteHyperdriveBindings"
		).mockRejectedValue(new Error("the remote proxy did not respond in time."));
		const dispose = vi.fn().mockResolvedValue(undefined);
		const session = {
			ready: Promise.resolve(),
			dispose,
			updateBindings: vi.fn(),
			remoteProxyConnectionString: new URL(
				"http://localhost:8787"
			) as RemoteProxyConnectionString,
		};
		const startSession = vi
			.fn<typeof startRemoteProxySession>()
			.mockResolvedValue(session);
		const logger = createTestLogger();

		const result = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: hyperdriveBindings() },
			undefined,
			undefined,
			{ logger },
			startSession
		);

		expect(result?.session).toBe(session);
		expect(result?.hyperdriveConnectionStrings.size).toBe(0);
		expect(dispose).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining(
				"Failed to fetch edge credentials for remote Hyperdrive bindings"
			)
		);
	});

	it("does not install a keepalive for sessions without remote Hyperdrive bindings", async ({
		expect,
	}) => {
		const seedSpy = vi
			.spyOn(seedHyperdriveBindings, "seedRemoteHyperdriveBindings")
			.mockResolvedValue(new Map());
		const startSession = vi
			.fn<typeof startRemoteProxySession>()
			.mockResolvedValue({
				ready: Promise.resolve(),
				dispose: vi.fn(),
				updateBindings: vi.fn(),
				remoteProxyConnectionString: new URL(
					"http://localhost:8787"
				) as RemoteProxyConnectionString,
			});

		await maybeStartOrUpdateRemoteProxySession(
			{
				bindings: {
					SERVICE: { type: "service", service: "worker", remote: true },
				},
			},
			undefined,
			undefined,
			{ logger: createTestLogger() },
			startSession
		);
		expect(seedSpy).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(HYPERDRIVE_KEEPALIVE_INTERVAL_MS * 3);
		// No further calls: only the initial seed, no keepalive was installed.
		expect(seedSpy).toHaveBeenCalledTimes(1);
	});
});
