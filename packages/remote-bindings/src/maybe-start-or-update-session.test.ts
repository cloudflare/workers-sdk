import { describe, it, vi } from "vitest";
import {
	maybeStartOrUpdateRemoteProxySession,
	pickRemoteBindings,
} from "./maybe-start-or-update-session";
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

function createTestSession() {
	return {
		ready: Promise.resolve(),
		dispose: vi.fn(),
		updateBindings: vi.fn(),
		remoteProxyConnectionString: new URL(
			"http://localhost:8787"
		) as RemoteProxyConnectionString,
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
		};

		const result = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: {} },
			existingSession,
			undefined,
			{ cliDisplayName: "Test CLI", logger: createTestLogger() },
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
			{ cliDisplayName: "Test CLI", logger: createTestLogger() },
			startSession
		);

		expect(result).toBeNull();
		expect(startSession).not.toHaveBeenCalled();
	});

	it("accepts bindings declared in cloudflare.config.ts", async ({
		expect,
	}) => {
		const startSession = vi.fn<typeof startRemoteProxySession>(async () =>
			createTestSession()
		);

		await maybeStartOrUpdateRemoteProxySession(
			{
				target: "cf",
				env: {
					AI: { type: "ai", dev: { remote: true } },
					KV: { type: "kv", id: "local-only" },
				},
			},
			undefined,
			{
				hook: async () => ({
					accountId: "account",
					apiToken: { apiToken: "token" },
				}),
			},
			{ cliDisplayName: "Test CLI", logger: createTestLogger() },
			startSession
		);

		expect(startSession).toHaveBeenCalledWith(
			{ AI: { type: "ai", remote: true } },
			expect.anything()
		);
	});

	it("restarts a session only when the auth key changes", async ({
		expect,
	}) => {
		const startSession = vi.fn<typeof startRemoteProxySession>(async () =>
			createTestSession()
		);
		const workerConfig = {
			target: "cf" as const,
			env: { AI: { type: "ai" as const, dev: { remote: true } } },
		};
		const context = { cliDisplayName: "Test CLI", logger: createTestLogger() };
		const newHook = () => async () => ({
			accountId: "account",
			apiToken: { apiToken: "token" },
		});

		const first = await maybeStartOrUpdateRemoteProxySession(
			workerConfig,
			undefined,
			{ hook: newHook(), key: "account-a" },
			context,
			startSession
		);
		// A new hook for the same credentials keeps the session
		const second = await maybeStartOrUpdateRemoteProxySession(
			workerConfig,
			first,
			{ hook: newHook(), key: "account-a" },
			context,
			startSession
		);
		expect(second?.session).toBe(first?.session);
		expect(startSession).toHaveBeenCalledTimes(1);

		const third = await maybeStartOrUpdateRemoteProxySession(
			workerConfig,
			second,
			{ hook: newHook(), key: "account-b" },
			context,
			startSession
		);
		expect(first?.session.dispose).toHaveBeenCalled();
		expect(third?.session).not.toBe(first?.session);
		expect(startSession).toHaveBeenCalledTimes(2);
	});

	it("restarts a session for a different hook passed alone", async ({
		expect,
	}) => {
		const startSession = vi.fn<typeof startRemoteProxySession>(async () =>
			createTestSession()
		);
		const workerConfig = {
			bindings: { AI: { type: "ai" as const, remote: true } },
		};
		const context = { cliDisplayName: "Test CLI", logger: createTestLogger() };
		const hook = async () => ({
			accountId: "account",
			apiToken: { apiToken: "token" },
		});

		const first = await maybeStartOrUpdateRemoteProxySession(
			workerConfig,
			undefined,
			hook,
			context,
			startSession
		);
		const second = await maybeStartOrUpdateRemoteProxySession(
			workerConfig,
			first,
			hook,
			context,
			startSession
		);
		expect(second?.session).toBe(first?.session);

		await maybeStartOrUpdateRemoteProxySession(
			workerConfig,
			second,
			async () => hook(),
			context,
			startSession
		);
		expect(first?.session.dispose).toHaveBeenCalled();
		expect(startSession).toHaveBeenCalledTimes(2);
	});
});
