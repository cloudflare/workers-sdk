import { EventEmitter } from "node:events";
import { describe, it, vi } from "vitest";
import { startRemoteProxySession } from "./start-remote-proxy-session";
import type { Worker } from "../internal/dev-env/types";

const mocks = vi.hoisted(() => ({
	startWorker: vi.fn(),
	createDefaultAuthHook: vi.fn(() => vi.fn()),
}));

vi.mock("../auth", () => ({
	createDefaultAuthHook: mocks.createDefaultAuthHook,
}));

vi.mock("./RemoteProxyDevEnv", () => ({
	RemoteProxyDevEnv: class {
		startWorker = mocks.startWorker;
	},
	RemoteSessionAuthenticationError: class extends Error {},
}));

function createWorker() {
	const raw = new EventEmitter() as Worker["raw"];
	const drained = vi.fn(async () => {});
	const patchConfig = vi.fn(async () => {
		raw.emit("reloadComplete", {});
	});
	const dispose = vi.fn(async () => {});
	Object.assign(raw, {
		proxy: {
			localServerReady: { promise: Promise.resolve() },
			runtimeMessageMutex: { drained },
		},
	});

	const worker = {
		ready: Promise.resolve(),
		url: Promise.resolve(new URL("http://127.0.0.1:8787")),
		patchConfig,
		dispose,
		raw,
	} as unknown as Worker;

	return { worker, raw, drained, patchConfig };
}

describe("startRemoteProxySession", () => {
	it("starts the existing DevEnv remote-minimal flow", async ({ expect }) => {
		const { worker } = createWorker();
		mocks.startWorker.mockResolvedValue(worker);
		const auth = vi.fn();

		await startRemoteProxySession(
			{
				KV: {
					type: "kv_namespace",
					id: "namespace-id",
					remote: true,
				},
			},
			{ workerName: "proxy", auth }
		);

		expect(mocks.startWorker).toHaveBeenCalledWith({
			name: "proxy",
			entrypoint: "ProxyServerWorker.mjs",
			compatibilityDate: "2025-04-28",
			complianceRegion: undefined,
			dev: {
				remote: "minimal",
				auth,
				server: { port: 0 },
				inspector: false,
				logLevel: "error",
			},
			bindings: {
				KV: {
					type: "kv_namespace",
					id: "namespace-id",
					remote: true,
					raw: true,
				},
			},
		});
		expect(mocks.createDefaultAuthHook).not.toHaveBeenCalled();
	});

	it("subscribes before patching and waits for the proxy to resume", async ({
		expect,
	}) => {
		const { worker, raw, drained, patchConfig } = createWorker();
		let reloadListenerCount = 0;
		patchConfig.mockImplementation(async () => {
			reloadListenerCount = raw.listenerCount("reloadComplete");
			raw.emit("reloadComplete", {});
		});
		mocks.startWorker.mockResolvedValue(worker);

		const session = await startRemoteProxySession({
			KV: { type: "kv_namespace", id: "old", remote: true },
		});
		await session.updateBindings({
			KV: { type: "kv_namespace", id: "new", remote: true },
		});

		expect(reloadListenerCount).toBe(1);
		expect(patchConfig).toHaveBeenCalledWith({
			bindings: {
				KV: {
					type: "kv_namespace",
					id: "new",
					remote: true,
					raw: true,
				},
			},
		});
		expect(drained).toHaveBeenCalledOnce();
		expect(patchConfig.mock.invocationCallOrder[0]).toBeLessThan(
			drained.mock.invocationCallOrder[0]
		);
	});

	it("surfaces errors emitted while establishing the session", async ({
		expect,
	}) => {
		const { worker, raw } = createWorker();
		Object.assign(raw.proxy, {
			localServerReady: { promise: new Promise<void>(() => {}) },
		});
		mocks.startWorker.mockImplementation(async () => {
			setTimeout(() => {
				raw.emit("error", {
					type: "error",
					reason: "Failed to obtain a preview token",
					cause: new Error("The remote worker preview failed."),
					source: "RemoteRuntimeController",
					data: undefined,
				});
			}, 0);
			return worker;
		});

		await expect(
			startRemoteProxySession(
				{},
				{ auth: { accountId: "id", apiToken: { apiToken: "token" } } }
			)
		).rejects.toThrow(
			"Failed to start the remote proxy session. Failed to obtain a preview token: The remote worker preview failed."
		);
	});
});
