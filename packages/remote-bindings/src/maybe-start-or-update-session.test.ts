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
	it.for<Record<string, Binding>>([
		{ AI: { type: "ai" } },
		{ AI: { type: "ai", remote: true } },
		{
			VECTORS: { type: "vectorize", index_name: "search", remote: true },
		},
		{
			AI: { type: "ai" },
			ORDERS: { type: "k2", stream: "orders" },
		},
		{
			AI: { type: "ai" },
			KV: { type: "kv_namespace", id: "kv", remote: true },
		},
		{ DB: { type: "d1", database_id: "db", remote: true } },
		{ KV: { type: "kv_namespace", id: "kv", remote: true } },
		{ ORDERS: { type: "k2", stream: "orders" } },
	])(
		"defers the connection for all remote bindings (%j)",
		async (bindings, { expect }) => {
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
				expect.objectContaining({ lazy: true, auth: testAuth })
			);
		}
	);

	it("keeps the lazy session when switching from AI to remote KV", async ({
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
		const bindings: Record<string, Binding> = {
			KV: { type: "kv_namespace", id: "kv", remote: true },
		};
		const next = await maybeStartOrUpdateRemoteProxySession(
			{ bindings },
			first,
			testAuth,
			context,
			startSession
		);
		expect(first?.session.updateBindings).toHaveBeenCalledWith(bindings);
		expect(first?.session.dispose).not.toHaveBeenCalled();
		expect(next?.session).toBe(first?.session);
		expect(next?.lazy).toBe(true);
		expect(startSession).toHaveBeenCalledOnce();
	});

	it("replaces an existing eager session with a lazy session", async ({
		expect,
	}) => {
		const existing = createTestSession();
		const startSession = vi
			.fn<typeof startRemoteProxySession>()
			.mockResolvedValue(createTestSession());
		const bindings: Record<string, Binding> = {
			KV: { type: "kv_namespace", id: "kv", remote: true },
		};
		const next = await maybeStartOrUpdateRemoteProxySession(
			{ bindings },
			{
				session: existing,
				remoteBindings: bindings,
				auth: testAuth,
				lazy: false,
			},
			testAuth,
			{ cliDisplayName: "Wrangler", logger: createTestLogger() },
			startSession
		);
		expect(existing.dispose).toHaveBeenCalledOnce();
		expect(next?.session).not.toBe(existing);
		expect(startSession).toHaveBeenCalledWith(
			bindings,
			expect.objectContaining({ lazy: true })
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

	it("selects Artifacts remotely only when opted in", ({ expect }) => {
		const defaultLocal = {
			type: "artifacts" as const,
			namespace: "default-local",
		};
		const local = {
			type: "artifacts" as const,
			namespace: "local",
			remote: false,
		};
		const remote = {
			type: "artifacts" as const,
			namespace: "remote",
			remote: true,
		};
		expect(
			pickRemoteBindings({
				DEFAULT: defaultLocal,
				LOCAL: local,
				REMOTE: remote,
			})
		).toEqual({ REMOTE: remote });
	});

	it.for([undefined, false, true])(
		"starts a session for native Artifacts only when remote=%s is true",
		async (remote, { expect }) => {
			const logger = createTestLogger();
			const startSession = vi.fn<typeof startRemoteProxySession>(async () =>
				createTestSession()
			);
			const result = await maybeStartOrUpdateRemoteProxySession(
				{
					target: "cf",
					env: {
						REPOS: {
							type: "artifacts",
							namespace: "examples",
							dev: { remote },
						},
					},
				},
				undefined,
				testAuth,
				{ cliDisplayName: "Wrangler", logger },
				startSession
			);
			if (remote === true) {
				expect(startSession).toHaveBeenCalledWith(
					{ REPOS: { type: "artifacts", namespace: "examples", remote } },
					expect.anything()
				);
			} else {
				expect(result).toBeNull();
				expect(startSession).not.toHaveBeenCalled();
			}
			// The dev tools warn about the local default; the session never does.
			expect(logger.warn).not.toHaveBeenCalled();
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
			auth: testAuth,
			lazy: true,
		};

		const result = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: {} },
			existingSession,
			testAuth,
			{ cliDisplayName: "Wrangler", logger: createTestLogger() },
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
			testAuth,
			{ cliDisplayName: "Wrangler", logger: createTestLogger() },
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
			{ cliDisplayName: "Wrangler", logger: createTestLogger() },
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
		const context: RemoteBindingsContext = {
			cliDisplayName: "Wrangler",
			logger: createTestLogger(),
		};
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
		const context: RemoteBindingsContext = {
			cliDisplayName: "Wrangler",
			logger: createTestLogger(),
		};
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
