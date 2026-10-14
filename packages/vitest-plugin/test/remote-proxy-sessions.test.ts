import util from "node:util";
import { beforeEach, describe, it, vi } from "vitest";
import { maybeStartOrUpdateRemoteProxySession } from "../../remote-bindings/src/maybe-start-or-update-session";
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

const integration = vi.hoisted(() => ({
	helper: vi.fn(),
	seed: vi.fn(),
	assemble: vi.fn(),
}));
vi.mock("@cloudflare/remote-bindings", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("@cloudflare/remote-bindings")>();
	return {
		...original,
		maybeStartOrUpdateRemoteProxySession: integration.helper,
	};
});
vi.mock("../../remote-bindings/src/seed-hyperdrive-bindings", () => ({
	seedRemoteHyperdriveBindings: integration.seed,
}));
vi.mock("../../remote-bindings/src/start-remote-proxy-session", () => ({
	startRemoteProxySession: vi.fn(),
	HYPERDRIVE_KEEPALIVE_INTERVAL_MS: 20 * 60 * 1000,
}));
vi.mock("wrangler", () => ({
	unstable_readConfig: () => ({ name: "shared", topLevelName: "shared" }),
	unstable_convertConfigBindingsToStartWorkerBindings: () => ({
		HD: { type: "hyperdrive", id: "id", remote: true },
		KV: { type: "kv_namespace", id: "kv", remote: true },
		R2: { type: "r2_bucket", bucket_name: "bucket", remote: true },
	}),
	unstable_getMiniflareWorkerOptions: integration.assemble,
}));

function fakeSessionData(dispose: () => Promise<void>): RemoteProxySessionData {
	return {
		session: {
			ready: Promise.resolve(),
			dispose,
			updateBindings: vi.fn(),
			updateHyperdriveKeepalive: vi.fn(),
			remoteProxyConnectionString: new URL(
				"http://localhost"
			) as RemoteProxyConnectionString,
		},
		remoteBindings: {},
		hyperdriveConnectionStrings: new Map(),
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
	return worker;
}

describe("remote proxy session disposal", () => {
	beforeEach(() => {
		remoteProxySessionsDataMap.clear();
	});

	it("preserves a shared session after seed and option assembly failure", async ({
		expect,
	}) => {
		const dispose = vi.fn(async () => {});
		const data = fakeSessionData(dispose);
		const configPath = "/shared/wrangler.json";
		data.remoteBindings = {
			HD: { type: "hyperdrive", id: "id", remote: true },
			KV: { type: "kv_namespace", id: "kv", remote: true },
			R2: { type: "r2_bucket", bucket_name: "bucket", remote: true },
		};
		remoteProxySessionsDataMap.set(configPath, data);
		integration.seed.mockRejectedValue(new Error("private-test-secret"));
		integration.helper.mockImplementation(maybeStartOrUpdateRemoteProxySession);
		integration.assemble.mockImplementation(
			(_config, _environment, options) => {
				if (!options.hyperdriveConnectionStrings.has("HD")) {
					throw new Error("missing edge credentials");
				}
				return {
					workerOptions: {},
					externalWorkers: [],
					define: {},
					main: undefined,
				};
			}
		);
		const project = {
			config: { root: "/shared", environment: "node" },
			vite: { config: { mode: "test" } },
		} as TestProject;
		poolWorkerStarted();
		poolWorkerStarted();
		await expect(
			parseProjectOptions(project, {
				wrangler: { configPath: "wrangler.json" },
			})
		).rejects.toThrow("missing edge credentials");
		expect(integration.seed).toHaveBeenCalledOnce();
		expect(remoteProxySessionsDataMap.get(configPath)?.session).toBe(
			data.session
		);
		expect(dispose).not.toHaveBeenCalled();
		const workerA = createPoolWorker();
		const workerB = createPoolWorker();
		await workerA.stop();
		expect(dispose).not.toHaveBeenCalled();
		expect(remoteProxySessionsDataMap.get(configPath)?.session).toBe(
			data.session
		);
		integration.seed.mockResolvedValue(new Map([["HD", "seeded"]]));
		await parseProjectOptions(project, {
			wrangler: { configPath: "wrangler.json" },
		});
		expect(remoteProxySessionsDataMap.get(configPath)?.session).toBe(
			data.session
		);
		await workerB.stop();
		expect(dispose).toHaveBeenCalledOnce();
		expect(remoteProxySessionsDataMap.has(configPath)).toBe(false);
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
});
