import { AuthenticationError } from "@cloudflare/workers-auth";
import { describe, it, vi } from "vitest";
import {
	maybeStartOrUpdateRemoteProxySession,
	pickRemoteBindings,
} from "./maybe-start-or-update-session";
import { RemoteSessionAuthenticationError } from "./utils/remote";
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
	it("also leaves remote-only bindings unavailable when remote authentication is rejected", async ({
		expect,
	}) => {
		const logger = createTestLogger();
		const startSession = vi
			.fn<typeof startRemoteProxySession>()
			.mockRejectedValue(
				new RemoteSessionAuthenticationError(new Error("401"), "cf")
			);
		const result = await maybeStartOrUpdateRemoteProxySession(
			{ target: "cf", env: { AI: { type: "ai" } } },
			undefined,
			testAuth,
			{ cliDisplayName: "cf", logger },
			startSession
		);
		expect(result).toBeNull();
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining("cf auth login")
		);
	});

	it("disposes a session that loses authentication during a binding update", async ({
		expect,
	}) => {
		const session = createTestSession();
		session.updateBindings.mockRejectedValueOnce(
			new AuthenticationError(
				"Expired",
				"token-expired-non-interactive",
				"test authentication failure"
			)
		);
		const result = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: { AI: { type: "ai" }, OTHER_AI: { type: "ai" } } },
			{ session, remoteBindings: { AI: { type: "ai" } }, auth: testAuth },
			testAuth,
			{ cliDisplayName: "Wrangler", logger: createTestLogger() }
		);
		expect(result).toBeNull();
		expect(session.dispose).toHaveBeenCalledOnce();
	});

	it("restarts the session when adding an explicitly remote local-capable binding changes the login policy", async ({
		expect,
	}) => {
		const first = createTestSession();
		const startSession = vi
			.fn<typeof startRemoteProxySession>()
			.mockResolvedValueOnce(first)
			.mockResolvedValueOnce(createTestSession());
		const auth = vi.fn(testAuth);
		const context: RemoteBindingsContext = {
			cliDisplayName: "Wrangler",
			logger: createTestLogger(),
		};
		const previous = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: { AI: { type: "ai" } } },
			undefined,
			auth,
			context,
			startSession
		);
		const next = await maybeStartOrUpdateRemoteProxySession(
			{
				bindings: {
					AI: { type: "ai" },
					KV: { type: "kv_namespace", id: "kv", remote: true },
				},
			},
			previous,
			auth,
			context,
			startSession
		);
		expect(first.dispose).toHaveBeenCalledOnce();
		expect(next?.session).not.toBe(first);
		expect(startSession).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.objectContaining({ auth })
		);
	});

	it.for<Record<string, Binding>>([
		{ AI: { type: "ai" as const } },
		{
			VECTORIZE: {
				type: "vectorize" as const,
				index_name: "search",
				remote: true,
			},
		},
		{
			AI: { type: "ai" as const, remote: true },
			ORDERS: { type: "k2" as const, stream: "orders" },
		},
	])(
		"keeps local development available when remote-only bindings cannot authenticate (%j)",
		async (bindings, { expect }) => {
			const logger = createTestLogger();
			const auth = vi.fn(async () => {
				throw new AuthenticationError(
					"No credentials",
					"no-credentials-non-interactive",
					"test authentication failure"
				);
			});
			const startSession = vi.fn<typeof startRemoteProxySession>(
				async (_bindings, options) => {
					if (typeof options.auth === "function") {
						await options.auth();
					}
					return createTestSession();
				}
			);
			const result = await maybeStartOrUpdateRemoteProxySession(
				{ bindings },
				undefined,
				auth,
				{ cliDisplayName: "Wrangler", logger },
				startSession
			);
			expect(result).toBeNull();
			expect(auth).toHaveBeenCalledWith({ allowLogin: false });
			expect(logger.warn).toHaveBeenCalledWith(
				expect.stringContaining("will throw when called")
			);
		}
	);

	it("disables login when remote-only bindings are added after removing every remote binding", async ({
		expect,
	}) => {
		const first = createTestSession();
		const startSession = vi.fn<typeof startRemoteProxySession>(
			async (_bindings, options) => {
				if (typeof options.auth === "function") {
					await options.auth();
				}
				return createTestSession();
			}
		);
		const auth = vi.fn(testAuth);
		const context: RemoteBindingsContext = {
			cliDisplayName: "Wrangler",
			logger: createTestLogger(),
		};
		const removed = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: {} },
			{
				session: first,
				remoteBindings: {
					KV: { type: "kv_namespace", id: "kv", remote: true },
				},
				auth,
			},
			auth,
			context,
			startSession
		);
		await maybeStartOrUpdateRemoteProxySession(
			{ bindings: { AI: { type: "ai" } } },
			removed,
			auth,
			context,
			startSession
		);
		expect(first.dispose).toHaveBeenCalledOnce();
		expect(auth).toHaveBeenCalledWith({ allowLogin: false });
	});

	it("does not hide setup errors unrelated to authentication", async ({
		expect,
	}) => {
		const error = new Error("Invalid binding configuration");
		const startSession = vi
			.fn<typeof startRemoteProxySession>()
			.mockRejectedValue(error);
		await expect(
			maybeStartOrUpdateRemoteProxySession(
				{ bindings: { AI: { type: "ai" } } },
				undefined,
				testAuth,
				{ cliDisplayName: "Wrangler", logger: createTestLogger() },
				startSession
			)
		).rejects.toBe(error);
	});

	it("still requires authentication when local-capable bindings explicitly use remote resources", async ({
		expect,
	}) => {
		const error = new AuthenticationError(
			"No credentials",
			"no-credentials-non-interactive",
			"test authentication failure"
		);
		const auth = vi.fn(async () => {
			throw error;
		});
		const startSession = vi.fn<typeof startRemoteProxySession>(
			async (_bindings, options) => {
				if (typeof options.auth === "function") {
					await options.auth();
				}
				return createTestSession();
			}
		);
		await expect(
			maybeStartOrUpdateRemoteProxySession(
				{
					bindings: {
						AI: { type: "ai" },
						KV: { type: "kv_namespace", id: "kv", remote: true },
					},
				},
				undefined,
				auth,
				{ cliDisplayName: "Wrangler", logger: createTestLogger() },
				startSession
			)
		).rejects.toBe(error);
		expect(auth).toHaveBeenCalledWith();
	});

	it("can authenticate after an unauthenticated config reload", async ({
		expect,
	}) => {
		const logger = createTestLogger();
		const startSession = vi
			.fn<typeof startRemoteProxySession>()
			.mockRejectedValueOnce(
				new AuthenticationError(
					"No credentials",
					"no-credentials-non-interactive",
					"test authentication failure"
				)
			)
			.mockResolvedValueOnce(createTestSession());
		const config = { bindings: { AI: { type: "ai" as const } } };
		const previous = await maybeStartOrUpdateRemoteProxySession(
			config,
			undefined,
			testAuth,
			{ cliDisplayName: "Wrangler", logger },
			startSession
		);
		const next = await maybeStartOrUpdateRemoteProxySession(
			config,
			previous,
			testAuth,
			{ cliDisplayName: "Wrangler", logger },
			startSession
		);
		expect(previous).toBeNull();
		expect(next?.session).toBeDefined();
		expect(startSession).toHaveBeenCalledTimes(2);
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
