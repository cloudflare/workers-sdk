import { describe, it, vi } from "vitest";
import { maybeStartOrUpdateRemoteProxySession } from "./maybe-start-or-update-session";
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
		once: {
			info: vi.fn(),
			log: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
	};
}

describe("maybeStartOrUpdateRemoteProxySession", () => {
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
