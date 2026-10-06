import assert from "node:assert";
import http from "node:http";
import { Message } from "capnp-es";
import {
	getWorkerRegistry,
	Miniflare,
	Runtime,
	Response as MiniflareResponse,
	SOCKET_DEV_REGISTRY,
} from "miniflare";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import WebSocket from "ws";
import { Config as CapnpConfig } from "../src/runtime/config/generated/workerd";
import { CoreBindings, CoreHeaders } from "../src/workers/core/constants";
import {
	disposeWithRetry,
	singleModuleManifest,
	useDispose,
	useTmp,
} from "./test-shared";
import type { MiniflareOptions } from "miniflare";

interface RuntimeInfo {
	registryUrl: string;
	registrySecret: string;
	loopbackUrl: string;
	loopbackSecret: string;
}

const infos: RuntimeInfo[] = [];

async function start(options: Partial<MiniflareOptions> = {}) {
	const registryPath = await useTmp();
	const opts: MiniflareOptions = {
		cf: false,
		unsafeEnableSharedStorage: true,
		resourcePersistencePath: await useTmp(),
		isolatedResourcePersistencePath: await useTmp(),
		unsafeDevRegistryPath: registryPath,
		workers: [
			{
				config: {
					name: "victim",
					compatibilityDate: "2026-09-04",
					manifest: singleModuleManifest(`export default {
				fetch() {
					return new Response("ok");
				}
			}`),
					env: { KV: { type: "kv", id: "test-kv" } },
				},
			},
		],
		...options,
	};
	const mf = new Miniflare(opts);
	useDispose(mf);
	await mf.ready;
	const info = infos.at(-1);
	assert(info);
	return { mf, info, registryPath };
}

async function webSocketStatus(url: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(url);
		socket.once("unexpected-response", (_request, response) => {
			response.resume();
			resolve(response.statusCode ?? 0);
			socket.terminate();
		});
		socket.once("error", reject);
		socket.once("open", () => {
			socket.close();
			reject(new Error("Unauthenticated WebSocket upgrade succeeded"));
		});
	});
}

describe.sequential("control-plane authentication", () => {
	beforeEach(() => {
		infos.length = 0;
		const updateConfig = Runtime.prototype.updateConfig;
		vi.spyOn(Runtime.prototype, "updateConfig").mockImplementation(
			async function (this: Runtime, ...args) {
				const config = new Message(args[0], false).getRoot(CapnpConfig);
				const registry = Array.from(config.services).find(
					(service) => service.name === "core:user:dev-registry-proxy"
				);
				const binding =
					registry &&
					Array.from(registry.worker.bindings).find(
						(entry) => entry.name === CoreBindings.DATA_DEV_REGISTRY_SECRET
					);
				const loopback = Array.from(config.services).find(
					(service) => service.name === "loopback"
				);
				const header =
					loopback &&
					Array.from(loopback.external.http.injectRequestHeaders).find(
						(entry) => entry.name === CoreHeaders.LOOPBACK_SECRET
					);
				assert(binding && header);
				const ports = await updateConfig.apply(this, args);
				infos.push({
					registryUrl: `http://127.0.0.1:${ports?.get(SOCKET_DEV_REGISTRY)}`,
					registrySecret: Buffer.from(binding.data.toUint8Array()).toString(),
					loopbackUrl: `http://${args[1].loopbackAddress}`,
					loopbackSecret: header.value,
				});
				return ports;
			}
		);
	});

	afterEach(() => vi.restoreAllMocks());

	test("rejects registry replacement before parsing and preserves shared storage", async ({
		expect,
	}) => {
		const { mf, info, registryPath } = await start();
		const kv = await mf.getKVNamespace("KV");
		await kv.put("canary", "original");
		for (const credential of [undefined, "unknown", "x".repeat(64)]) {
			const headers: Record<string, string> = {};
			if (credential !== undefined) {
				headers[CoreHeaders.DEV_REGISTRY_SECRET] = credential;
			}
			const response = await fetch(info.registryUrl, {
				method: "POST",
				headers,
				body: "not JSON",
			});
			expect(response.status).toBe(403);
			await response.text();
		}
		expect(await kv.get("canary")).toBe("original");
		const registry = getWorkerRegistry(registryPath);
		const owner = Object.values(registry).find((entry) => entry.storageScope);
		assert(owner);
		const forged = await fetch(info.registryUrl, {
			method: "POST",
			body: JSON.stringify({
				attacker: { ...owner, created: 0, debugPortAddress: "127.0.0.1:9" },
			}),
		});
		expect(forged.status).toBe(403);
		await forged.text();
		expect(await kv.get("canary")).toBe("original");
		const snapshot = JSON.stringify(registry);
		for (const [url, extra] of [
			[`${info.registryUrl}/unexpected`, {}],
			[info.registryUrl, { Origin: "http://localhost" }],
		] as const) {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					[CoreHeaders.DEV_REGISTRY_SECRET]: info.registrySecret,
					...extra,
				},
				body: snapshot,
			});
			expect(response.status).toBe(403);
			await response.text();
		}
		// Node fetch rewrites Host; use the HTTP client to preserve a forged one.
		const forgedHostStatus = await new Promise<number>((resolve, reject) => {
			const request = http.request(
				info.registryUrl,
				{
					method: "POST",
					headers: {
						Host: "attacker.example",
						[CoreHeaders.DEV_REGISTRY_SECRET]: info.registrySecret,
					},
				},
				(response) => {
					response.resume();
					resolve(response.statusCode ?? 0);
				}
			);
			request.on("error", reject);
			request.end(snapshot);
		});
		expect(forgedHostStatus).toBe(403);
		const authorized = await fetch(info.registryUrl, {
			method: "POST",
			headers: { [CoreHeaders.DEV_REGISTRY_SECRET]: info.registrySecret },
			body: snapshot,
		});
		expect(authorized.status).toBe(200);
		await authorized.text();
		expect(await kv.get("canary")).toBe("original");
		const discovery = await fetch(`${info.loopbackUrl}/core/dev-registry`, {
			headers: { [CoreHeaders.LOOPBACK_SECRET]: info.loopbackSecret },
		});
		expect(discovery.status).toBe(200);
		const metadata = await discovery.text();
		expect(metadata).not.toContain(info.registrySecret);
		expect(metadata).not.toContain(info.loopbackSecret);
	});

	test("rejects credentials from other and disposed runtimes", async ({
		expect,
	}) => {
		const first = await start();
		const second = await start();
		expect(first.info.registrySecret).not.toBe(second.info.registrySecret);
		expect(first.info.loopbackSecret).not.toBe(second.info.loopbackSecret);
		await disposeWithRetry(first.mf);
		for (const [url, headers] of [
			[
				second.info.registryUrl,
				{ [CoreHeaders.DEV_REGISTRY_SECRET]: first.info.registrySecret },
			],
			[
				`${second.info.loopbackUrl}/core/dev-registry`,
				{ [CoreHeaders.LOOPBACK_SECRET]: first.info.loopbackSecret },
			],
		] as const) {
			const response = await fetch(url, {
				method: "POST",
				headers,
				body: "{}",
			});
			expect(response.status).toBe(403);
			await response.text();
		}
	});

	test("protects loopback discovery, custom services, browser control, and upgrades", async ({
		expect,
	}) => {
		const fallback = vi.fn(() => new MiniflareResponse("module"));
		const { mf, info } = await start({
			unsafeModuleFallbackService: fallback,
		});
		for (const pathname of [
			"/core/dev-registry",
			"/core/public-url",
			"/browser/sessionIds",
			"/core/do-storage/test/test",
		]) {
			for (const headers of [
				{},
				{
					[CoreHeaders.LOOPBACK_SECRET]: "unknown",
					[CoreHeaders.CUSTOM_NODE_SERVICE]: "0/n/test",
					"X-Resolve-Method": "import",
				},
			]) {
				const response = await fetch(
					`${info.loopbackUrl}${pathname}?specifier=module`,
					{
						headers,
					}
				);
				expect(response.status).toBe(403);
				await response.text();
			}
		}
		expect(fallback).not.toHaveBeenCalled();
		expect(
			await webSocketStatus(
				`${info.loopbackUrl.replace("http:", "ws:")}/core/dev-registry`
			)
		).toBe(403);
		const authorized = await fetch(`${info.loopbackUrl}/core/dev-registry`, {
			headers: { [CoreHeaders.LOOPBACK_SECRET]: info.loopbackSecret },
		});
		expect(authorized.status).toBe(200);
		await authorized.text();
		// Exercise legitimate workerd-to-Node loopback traffic as well.
		expect(await (await mf.dispatchFetch("http://localhost/")).text()).toBe(
			"ok"
		);
	});
});
