import { beforeEach, describe, it, vi } from "vitest";
import {
	disposeAllRemoteProxySessions,
	remoteProxySessionsDataMap,
} from "../src/pool/config";
import { poolWorkerStarted, poolWorkerStopped } from "../src/pool/pages";
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

// Mirrors CloudflarePoolWorker.stop(): dispose the shared sessions only once the
// last worker stops.
async function stopWorker(): Promise<boolean> {
	const wasLastWorker = poolWorkerStopped();
	if (wasLastWorker) {
		await disposeAllRemoteProxySessions();
	}
	return wasLastWorker;
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

		// Two overlapping pool workers (consecutive test files) share one session.
		poolWorkerStarted();
		poolWorkerStarted();

		expect(await stopWorker()).toBe(false);
		expect(dispose).not.toHaveBeenCalled();

		expect(await stopWorker()).toBe(true);
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(remoteProxySessionsDataMap.has(configPath)).toBe(false);
	});
});
