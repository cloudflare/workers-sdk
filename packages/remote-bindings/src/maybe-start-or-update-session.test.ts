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

	it.for([undefined, false, true])(
		"starts an Artifacts remote session only for remote=%s or the default",
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
			if (remote === false) {
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
