import util from "node:util";
import { beforeEach, describe, it, vi } from "vitest";
import { CloudflarePoolWorker } from "../src/pool/cloudflare-pool-worker";
import {
	disposeAllRemoteProxySessions,
	remoteProxySessionsDataMap,
} from "../src/pool/config";
import { poolWorkerStarted } from "../src/pool/pages";
import type { RemoteProxySessionData } from "@cloudflare/remote-bindings";
import type { RemoteProxyConnectionString } from "miniflare";

function fakeSessionData(dispose: () => Promise<void>): RemoteProxySessionData {
	return {
		session: {
			ready: Promise.resolve(),
			dispose,
			updateBindings: vi.fn(),
			remoteProxyConnectionString: new URL(
				"http://localhost"
			) as RemoteProxyConnectionString,
		},
		remoteBindings: {},
	};
}

// Bypasses the constructor's version check. start() is never called; tests
// install only the lifecycle resources needed by each stop() scenario.
function createPoolWorker(): CloudflarePoolWorker {
	const worker = Object.create(
		CloudflarePoolWorker.prototype
	) as CloudflarePoolWorker;
	Object.defineProperty(worker, "debug", {
		value: util.debuglog("vitest-plugin"),
	});
	return worker;
}

function createDeferred(): {
	promise: Promise<void>;
	resolve: () => void;
} {
	let resolve = () => {};
	const promise = new Promise<void>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

describe("remote proxy session disposal", () => {
	beforeEach(() => {
		remoteProxySessionsDataMap.clear();
	});

	it("disposes every session and clears the map", async ({ expect }) => {
		const a = vi.fn(async () => {});
		const b = vi.fn(async () => {});
		remoteProxySessionsDataMap.set("/a/wrangler.toml", fakeSessionData(a));
		remoteProxySessionsDataMap.set("/b/wrangler.toml", fakeSessionData(b));

		await disposeAllRemoteProxySessions();

		expect(a).toHaveBeenCalledTimes(1);
		expect(b).toHaveBeenCalledTimes(1);
		expect(remoteProxySessionsDataMap.size).toBe(0);
	});

	it("keeps the shared session alive until the last worker using it stops", async ({
		expect,
	}) => {
		const dispose = vi.fn(async () => {});
		const configPath = "/shared/wrangler.toml";
		remoteProxySessionsDataMap.set(configPath, fakeSessionData(dispose));

		// Two overlapping pool workers share one session.
		poolWorkerStarted();
		poolWorkerStarted();

		const workerA = createPoolWorker();
		const workerB = createPoolWorker();

		await workerA.stop();
		expect(dispose).not.toHaveBeenCalled();

		await workerB.stop();
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(remoteProxySessionsDataMap.has(configPath)).toBe(false);
	});

	it("awaits Miniflare before releasing the final project environment", async ({
		expect,
	}) => {
		const miniflareDisposal = createDeferred();
		const disposeMiniflare = vi.fn(() => miniflareDisposal.promise);
		const disposeSession = vi.fn(async () => {});
		remoteProxySessionsDataMap.set(
			"/shared/wrangler.toml",
			fakeSessionData(disposeSession)
		);
		poolWorkerStarted();
		const worker = createPoolWorker();
		Object.defineProperty(worker, "mf", {
			configurable: true,
			value: { dispose: disposeMiniflare },
			writable: true,
		});

		const stopping = worker.stop();
		await vi.waitFor(() => expect(disposeMiniflare).toHaveBeenCalledOnce());
		expect(disposeSession).not.toHaveBeenCalled();

		miniflareDisposal.resolve();
		await stopping;
		expect(disposeSession).toHaveBeenCalledOnce();
	});

	it("disposes Miniflare when closing the runner socket throws", async ({
		expect,
	}) => {
		const calls: string[] = [];
		const worker = createPoolWorker();
		Object.defineProperties(worker, {
			socket: {
				configurable: true,
				value: {
					close: vi.fn(() => {
						calls.push("close");
						throw new Error("socket close failed");
					}),
				},
				writable: true,
			},
			mf: {
				configurable: true,
				value: {
					dispose: vi.fn(async () => {
						calls.push("dispose");
					}),
				},
				writable: true,
			},
		});
		poolWorkerStarted();

		await expect(worker.stop()).resolves.toBeUndefined();

		expect(calls).toEqual(["close", "dispose"]);
	});
});
