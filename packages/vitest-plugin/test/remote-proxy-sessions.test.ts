import fs from "node:fs/promises";
import path from "node:path";
import util from "node:util";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { CloudflarePoolWorker } from "../src/pool/cloudflare-pool-worker";
import {
	disposeAllRemoteProxySessions,
	parseProjectOptions,
	remoteProxySessionsDataMap,
} from "../src/pool/config";
import { poolWorkerStarted } from "../src/pool/pages";
import type { RemoteProxySessionData } from "@cloudflare/remote-bindings";
import type { RemoteProxyConnectionString } from "miniflare";
import type { TestProject } from "vitest/node";

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

// Bypasses the constructor's version check; start() is never called so
// socket/miniflare are undefined and stop() exercises only session disposal.
function createPoolWorker(): CloudflarePoolWorker {
	const worker = Object.create(
		CloudflarePoolWorker.prototype
	) as CloudflarePoolWorker;
	Object.defineProperty(worker, "debug", {
		value: util.debuglog("vitest-plugin"),
	});
	Object.defineProperty(worker, "moduleFetchRequestIds", {
		value: new Set<string>(),
	});
	return worker;
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

	describe("projects with remote bindings disabled", () => {
		runInTempDir();

		it.for(["cloudflare.config.ts", "wrangler.jsonc"])(
			"preserves the shared session for %s until shutdown",
			async (configFile, { expect }) => {
				await fs.writeFile(
					configFile,
					configFile === "cloudflare.config.ts"
						? `export default { worker: {
							name: "shared-worker", compatibilityDate: "2026-01-01",
							env: { AI: { type: "ai" } },
						} };`
						: JSON.stringify({
								name: "shared-worker",
								compatibility_date: "2026-01-01",
								ai: { binding: "AI" },
							})
				);
				const configPath = path.resolve(configFile);
				const dispose = vi.fn(async () => {});
				const sessionData = fakeSessionData(dispose);
				remoteProxySessionsDataMap.set(configPath, sessionData);
				const project = {
					name: "remote-bindings-disabled",
					config: { root: process.cwd() },
					vite: { config: { mode: "test", envDir: process.cwd() } },
				} as unknown as TestProject;

				const options = await parseProjectOptions(project, {
					...(configFile === "cloudflare.config.ts"
						? { config: true }
						: { wrangler: { configPath } }),
					remoteBindings: false,
				});

				expect(
					options.projectWorkers?.[0].dev?.remoteProxyConnectionString
				).toBeUndefined();
				expect(remoteProxySessionsDataMap.get(configPath)).toBe(sessionData);
				expect(dispose).not.toHaveBeenCalled();

				await disposeAllRemoteProxySessions();
				expect(dispose).toHaveBeenCalledOnce();
				expect(remoteProxySessionsDataMap.size).toBe(0);
			}
		);
	});
});
