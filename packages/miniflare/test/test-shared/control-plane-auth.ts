import assert from "node:assert";
import { Message } from "capnp-es";
import { Miniflare, Runtime, SOCKET_DEV_REGISTRY } from "miniflare";
import { test as baseTest, vi } from "vitest";
import { Config as CapnpConfig } from "../../src/runtime/config/generated/workerd";
import { CoreBindings, CoreHeaders } from "../../src/workers/core/constants";
import { singleModuleManifest, useDispose, useTmp } from "./index";
import type { MiniflareOptions } from "miniflare";

interface RuntimeInfo {
	registryUrl: string;
	registrySecret: string;
	loopbackUrl: string;
	loopbackSecret: string;
}

async function startRuntime(
	infos: RuntimeInfo[],
	options: Partial<MiniflareOptions> = {}
) {
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

/** Starts runtimes and captures their control-plane credentials for each test. */
export const test = baseTest.extend<{
	start: (
		options?: Partial<MiniflareOptions>
	) => ReturnType<typeof startRuntime>;
}>({
	start: async ({ onTestFinished }, use) => {
		const infos: RuntimeInfo[] = [];
		const updateConfig = Runtime.prototype.updateConfig;
		const spy = vi
			.spyOn(Runtime.prototype, "updateConfig")
			.mockImplementation(async function (this: Runtime, ...args) {
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
			});
		onTestFinished(() => spy.mockRestore());
		await use((options) => startRuntime(infos, options));
	},
});
