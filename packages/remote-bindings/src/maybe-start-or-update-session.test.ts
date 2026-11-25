import { describe, it, vi } from "vitest";
import {
	maybeStartOrUpdateRemoteProxySession,
	pickRemoteBindings,
} from "./maybe-start-or-update-session";
import type { RemoteBindingsLogger } from "./logger";
import type {
	RemoteBindingsContext,
	RemoteProxySessionData,
} from "./maybe-start-or-update-session";
import type { startRemoteProxySession } from "./start-remote-proxy-session";
import type { Binding } from "@cloudflare/workers-utils";
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

const testAuth = async () => ({
	accountId: "account",
	apiToken: { apiToken: "token" },
});

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
	it.for<{ bindings: Record<string, Binding>; lazy: boolean }>([
		{ bindings: { AI: { type: "ai" } }, lazy: true },
		{ bindings: { AI: { type: "ai", remote: true } }, lazy: true },
		{
			bindings: {
				VECTORS: { type: "vectorize", index_name: "search", remote: true },
			},
			lazy: true,
		},
		{
			bindings: {
				AI: { type: "ai" },
				ORDERS: { type: "k2", stream: "orders" },
			},
			lazy: true,
		},
		{
			bindings: {
				AI: { type: "ai" },
				KV: { type: "kv_namespace", id: "kv", remote: true },
			},
			lazy: false,
		},
	])(
		"defers the connection only for remote-only resources (%j)",
		async ({ bindings, lazy }, { expect }) => {
			const startSession = vi
				.fn<typeof startRemoteProxySession>()
				.mockResolvedValue(createTestSession());
			await maybeStartOrUpdateRemoteProxySession(
				{ bindings },
				undefined,
				testAuth,
				{ cliDisplayName: "Wrangler", logger: createTestLogger() },
				startSession
			);
			expect(startSession).toHaveBeenCalledWith(
				bindings,
				expect.objectContaining({ lazy, auth: testAuth })
			);
		}
	);

	it("restarts when adding a local-capable remote binding requires an eager connection", async ({
		expect,
	}) => {
		const startSession = vi
			.fn<typeof startRemoteProxySession>()
			.mockImplementation(async () => createTestSession());
		const context: RemoteBindingsContext = {
			cliDisplayName: "Wrangler",
			logger: createTestLogger(),
		};
		const first = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: { AI: { type: "ai" } } },
			undefined,
			testAuth,
			context,
			startSession
		);
		const removed = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: {} },
			first,
			testAuth,
			context,
			startSession
		);
		expect(removed?.session).toBe(first?.session);
		const next = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: { KV: { type: "kv_namespace", id: "kv", remote: true } } },
			removed,
			testAuth,
			context,
			startSession
		);
		expect(first?.session.dispose).toHaveBeenCalledOnce();
		expect(next?.session).not.toBe(first?.session);
		expect(startSession).toHaveBeenCalledTimes(2);
		expect(startSession).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.objectContaining({ lazy: false })
		);
	});

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

	it.for([undefined, false, true])(
		"starts an Artifacts remote session only when remote=%s is true",
		async (remote, { expect }) => {
			const binding = {
				type: "artifacts" as const,
				namespace: "examples",
				remote,
			};
			const session = {
				ready: Promise.resolve(),
				dispose: vi.fn(),
				updateBindings: vi.fn(),
				remoteProxyConnectionString: new URL(
					"http://localhost:8787"
				) as RemoteProxyConnectionString,
			};
			const startSession = vi
				.fn<typeof startRemoteProxySession>()
				.mockResolvedValue(session);
			const result = await maybeStartOrUpdateRemoteProxySession(
				{ bindings: { REPOS: binding } },
				undefined,
				undefined,
				{ cliDisplayName: "Vite", logger: createTestLogger() },
				startSession
			);
			if (remote !== true) {
				expect(result).toBeNull();
				expect(startSession).not.toHaveBeenCalled();
			} else {
				expect(result?.session).toBe(session);
				expect(startSession).toHaveBeenCalledWith(
					{ REPOS: binding },
					expect.anything()
				);
			}
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
});
