import { afterEach, describe, it, vi } from "vitest";
import {
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

function createSession() {
	return {
		ready: Promise.resolve(),
		dispose: vi.fn(async () => {}),
		updateBindings: vi.fn(async () => {}),
		updateHyperdriveKeepalive: vi.fn(),
		remoteProxyConnectionString: new URL(
			"http://localhost:8787"
		) as RemoteProxyConnectionString,
	};
}

function hyperdriveBindings() {
	return {
		HYPERDRIVE: { type: "hyperdrive" as const, id: "some-id", remote: true },
		KV: { type: "kv_namespace" as const, id: "kv-id", remote: true },
		R2: { type: "r2_bucket" as const, bucket_name: "bucket", remote: true },
	};
}

describe("maybeStartOrUpdateRemoteProxySession", () => {
	afterEach(() => vi.restoreAllMocks());

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
		const session = createSession();
		const existing: RemoteProxySessionData = {
			session,
			remoteBindings: {
				SERVICE: { type: "service", service: "worker", remote: true },
			},
			hyperdriveConnectionStrings: new Map(),
		};
		const startSession = vi.fn<typeof startRemoteProxySession>();
		const result = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: {} },
			existing,
			undefined,
			{ logger: createTestLogger() },
			startSession
		);
		expect(result?.session).toBe(session);
		expect(session.updateBindings).toHaveBeenCalledWith({});
		expect(session.updateHyperdriveKeepalive).toHaveBeenCalledWith({});
		expect(session.dispose).not.toHaveBeenCalled();
		expect(startSession).not.toHaveBeenCalled();
	});

	it("does not start a session without remote bindings", async ({ expect }) => {
		const startSession = vi.fn<typeof startRemoteProxySession>();
		expect(
			await maybeStartOrUpdateRemoteProxySession(
				{ bindings: {} },
				undefined,
				undefined,
				{ logger: createTestLogger() },
				startSession
			)
		).toBeNull();
		expect(startSession).not.toHaveBeenCalled();
	});

	it.for([false, true])(
		"preserves caller ownership on seed failure with reused=%s",
		async (reused, { expect }) => {
			const seedSpy = vi
				.spyOn(seedHyperdriveBindings, "seedRemoteHyperdriveBindings")
				.mockRejectedValue(new Error("private-test-secret"));
			const session = createSession();
			const bindings = hyperdriveBindings();
			const existing: RemoteProxySessionData = {
				session,
				remoteBindings: bindings,
				hyperdriveConnectionStrings: new Map(),
			};
			const logger = createTestLogger();
			const startSession = vi
				.fn<typeof startRemoteProxySession>()
				.mockResolvedValue(session);
			const result = await maybeStartOrUpdateRemoteProxySession(
				{ bindings },
				reused ? existing : undefined,
				undefined,
				{ logger },
				startSession
			);
			expect(result?.session).toBe(session);
			expect(result?.hyperdriveConnectionStrings.size).toBe(0);
			expect(result?.remoteBindings).toEqual(bindings);
			expect(session.dispose).not.toHaveBeenCalled();
			expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(
				"private-test-secret"
			);
			seedSpy.mockResolvedValue(new Map([["HYPERDRIVE", "seeded"]]));
			const recovered = await maybeStartOrUpdateRemoteProxySession(
				{ bindings },
				result,
				undefined,
				{ logger },
				startSession
			);
			expect(recovered?.session).toBe(session);
			expect(recovered?.hyperdriveConnectionStrings.get("HYPERDRIVE")).toBe(
				"seeded"
			);
		}
	);

	it("retargets the keepalive only after a successful update", async ({
		expect,
	}) => {
		vi.spyOn(
			seedHyperdriveBindings,
			"seedRemoteHyperdriveBindings"
		).mockResolvedValue(new Map());
		const session = createSession();
		const startSession = vi
			.fn<typeof startRemoteProxySession>()
			.mockResolvedValue(session);
		const first = await maybeStartOrUpdateRemoteProxySession(
			{ bindings: hyperdriveBindings() },
			undefined,
			undefined,
			{ logger: createTestLogger() },
			startSession
		);
		session.updateHyperdriveKeepalive.mockClear();
		session.updateBindings.mockRejectedValueOnce(new Error("reload failed"));
		await expect(
			maybeStartOrUpdateRemoteProxySession(
				{ bindings: {} },
				first,
				undefined,
				{ logger: createTestLogger() },
				startSession
			)
		).rejects.toThrow("reload failed");
		expect(session.updateHyperdriveKeepalive).not.toHaveBeenCalled();
		expect(session.dispose).not.toHaveBeenCalled();
	});

	it("waits for ready before starting keepalive and cleans a newly owned failed session", async ({
		expect,
	}) => {
		const session = createSession();
		const error = new Error("not ready");
		session.ready = Promise.reject(error);
		session.dispose.mockRejectedValueOnce(new Error("cleanup failed"));
		const startSession = vi
			.fn<typeof startRemoteProxySession>()
			.mockResolvedValue(session);
		await expect(
			maybeStartOrUpdateRemoteProxySession(
				{ bindings: hyperdriveBindings() },
				undefined,
				undefined,
				{ logger: createTestLogger() },
				startSession
			)
		).rejects.toBe(error);
		expect(session.updateHyperdriveKeepalive).not.toHaveBeenCalled();
		expect(session.dispose).toHaveBeenCalledOnce();
	});
});
