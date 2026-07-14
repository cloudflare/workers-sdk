import { describe, it, vi } from "vitest";
import {
	maybeStartOrUpdateRemoteProxySession,
	pickRemoteBindings,
} from "./maybe-start-or-update-session";
import { startRemoteProxySession } from "./start-remote-proxy-session";
import type { RemoteProxySession } from "./start-remote-proxy-session";

vi.mock("./start-remote-proxy-session", () => ({
	startRemoteProxySession: vi.fn(),
}));

function createSession(): RemoteProxySession {
	return {
		ready: Promise.resolve(),
		remoteProxyConnectionString: new URL(
			"http://127.0.0.1:8787"
		) as RemoteProxySession["remoteProxyConnectionString"],
		updateBindings: vi.fn(async () => {}),
		dispose: vi.fn(async () => {}),
	};
}

describe("maybeStartOrUpdateRemoteProxySession", () => {
	it("picks explicit remote bindings and bindings without local support", ({
		expect,
	}) => {
		expect(
			pickRemoteBindings({
				LOCAL: { type: "kv_namespace", id: "local" },
				REMOTE: { type: "kv_namespace", id: "remote", remote: true },
				AI: { type: "ai" },
			})
		).toEqual({
			REMOTE: { type: "kv_namespace", id: "remote", remote: true },
			AI: { type: "ai" },
		});
	});

	it("reuses a session and updates changed bindings when auth is unchanged", async ({
		expect,
	}) => {
		const session = createSession();
		const auth = vi.fn();
		const result = await maybeStartOrUpdateRemoteProxySession(
			{
				bindings: {
					KV: { type: "kv_namespace", id: "new", remote: true },
				},
			},
			{
				session,
				remoteBindings: {
					KV: { type: "kv_namespace", id: "old", remote: true },
				},
				auth,
				worker: {
					name: undefined,
					accountId: undefined,
					complianceRegion: undefined,
					profileDir: undefined,
				},
			},
			{ auth }
		);

		expect(session.updateBindings).toHaveBeenCalledOnce();
		expect(startRemoteProxySession).not.toHaveBeenCalled();
		expect(result?.session).toBe(session);
	});

	it("disposes and restarts the session when auth changes", async ({
		expect,
	}) => {
		const previousSession = createSession();
		const nextSession = createSession();
		vi.mocked(startRemoteProxySession).mockResolvedValue(nextSession);
		const previousAuth = vi.fn();
		const nextAuth = vi.fn();

		const result = await maybeStartOrUpdateRemoteProxySession(
			{
				name: "worker",
				bindings: {
					KV: { type: "kv_namespace", id: "namespace", remote: true },
				},
			},
			{
				session: previousSession,
				remoteBindings: {},
				auth: previousAuth,
			},
			{ auth: nextAuth }
		);

		expect(previousSession.dispose).toHaveBeenCalledOnce();
		expect(startRemoteProxySession).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({ auth: nextAuth, workerName: "worker" })
		);
		expect(result?.session).toBe(nextSession);
		expect(
			vi.mocked(startRemoteProxySession).mock.invocationCallOrder[0]
		).toBeLessThan(
			vi.mocked(previousSession.dispose).mock.invocationCallOrder[0]
		);
	});

	it("restarts when the worker identity changes", async ({ expect }) => {
		const previousSession = createSession();
		const nextSession = createSession();
		vi.mocked(startRemoteProxySession).mockResolvedValue(nextSession);

		await maybeStartOrUpdateRemoteProxySession(
			{ name: "new", bindings: { AI: { type: "ai" } } },
			{
				session: previousSession,
				remoteBindings: { AI: { type: "ai" } },
				worker: { name: "old" },
			}
		);

		expect(startRemoteProxySession).toHaveBeenCalledOnce();
		expect(previousSession.dispose).toHaveBeenCalledOnce();
	});

	it("does not start an empty session when auth is provided", async ({
		expect,
	}) => {
		await expect(
			maybeStartOrUpdateRemoteProxySession({ bindings: {} }, undefined, {
				auth: vi.fn(),
			})
		).resolves.toBeNull();
		expect(startRemoteProxySession).not.toHaveBeenCalled();
	});
});
