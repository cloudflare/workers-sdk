import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { getWorkerRegistry, Miniflare } from "miniflare";
import { test } from "vitest";
import { singleModuleManifest, useDispose, useTmp } from "../../test-shared";
import type { MiniflareOptions, WorkerDefinition } from "miniflare";

test.for(["assets", "Workers Sites"] as const)(
	"%s disk service rejects writes through debug RPC",
	async (type, { expect }) => {
		const directory = await useTmp();
		const filePath = path.join(directory, "test.txt");
		await fs.writeFile(filePath, "original");
		const registryPath = await useTmp();
		const options: MiniflareOptions = {
			unsafeDevRegistryPath: registryPath,
			resourcePersistencePath: await useTmp(),
			workers: [
				{
					config: {
						name: "static-worker",
						compatibilityDate: "2026-04-29",
						manifest: singleModuleManifest(`export default {
							async fetch(request, env) {
								const key = new URL(request.url).pathname.slice(1);
								return new Response(await env.__STATIC_CONTENT.get(key));
							}
						}`),
						assets: type === "assets" ? { directory } : undefined,
						env: { KV: { type: "kv", id: "writable-kv" } },
					},
					legacy:
						type === "Workers Sites" ? { sitePath: directory } : undefined,
				},
			],
		};
		const mf = new Miniflare(options);
		useDispose(mf);
		await mf.ready;

		// Reach the disk service directly in a separate workerd process, bypassing
		// the namespace Worker's method guard. Omitting instanceId forces TCP RPC.
		const definition = getWorkerRegistry(registryPath)["static-worker"];
		assert(definition);
		const serviceName =
			type === "assets" ? "assets:storage:static-worker" : "kv:site:storage";
		const clientRegistryPath = await useTmp();
		await fs.writeFile(
			path.join(clientRegistryPath, "disk"),
			JSON.stringify({
				debugPortAddress: definition.debugPortAddress,
				defaultEntrypointService: serviceName,
				userWorkerService: serviceName,
			} satisfies WorkerDefinition)
		);
		const client = new Miniflare({
			unsafeDevRegistryPath: clientRegistryPath,
			workers: [
				{
					config: {
						name: "disk-client",
						compatibilityDate: "2026-04-29",
						manifest: singleModuleManifest(`export default {
							fetch(request, env) { return env.DISK.fetch(request); }
						}`),
						env: { DISK: { type: "worker", worker: "disk" } },
					},
				},
			],
		});
		useDispose(client);

		for (const instance of [mf, client]) {
			const response = await instance.dispatchFetch(
				"http://example.com/test.txt"
			);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe("original");
		}

		const statuses: number[] = [];
		for (const [method, pathname] of [
			["PUT", "/test.txt"],
			["PUT", "/nested/new.txt"],
			["DELETE", "/test.txt"],
		]) {
			const response = await client.dispatchFetch(
				`http://example.com${pathname}`,
				{
					method,
					body: method === "PUT" ? "modified" : undefined,
				}
			);
			statuses.push(response.status);
			await response.arrayBuffer();
		}
		expect(statuses).toEqual([405, 405, 405]);
		expect(await fs.readFile(filePath, "utf8")).toBe("original");
		expect(await fs.readdir(directory)).toEqual(["test.txt"]);

		const unchanged = await mf.dispatchFetch("http://example.com/test.txt");
		expect(unchanged.status).toBe(200);
		expect(await unchanged.text()).toBe("original");

		// Developer writes and manifest reloads still work, as does the separate
		// writable persistence service used by ordinary KV namespaces.
		const kv = await mf.getKVNamespace("KV");
		await kv.put("canary", "before reload");
		expect(await kv.get("canary")).toBe("before reload");
		await fs.writeFile(filePath, "updated");
		await fs.writeFile(path.join(directory, "new.txt"), "new asset");
		await mf.setOptions(options);
		for (const [name, contents] of [
			["test.txt", "updated"],
			["new.txt", "new asset"],
		]) {
			const response = await mf.dispatchFetch(`http://example.com/${name}`);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe(contents);
		}
		const reloadedKV = await mf.getKVNamespace("KV");
		expect(await reloadedKV.get("canary")).toBe("before reload");
		await reloadedKV.put("canary", "after reload");
		expect(await reloadedKV.get("canary")).toBe("after reload");
		await reloadedKV.delete("canary");
		expect(await reloadedKV.get("canary")).toBeNull();
	}
);
