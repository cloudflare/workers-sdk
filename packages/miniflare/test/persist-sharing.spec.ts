import { Miniflare } from "miniflare";
import { afterEach, describe, test } from "vitest";
import { singleModuleManifest, useTmp } from "./test-shared";
import type { MiniflareOptions } from "miniflare";

const SCRIPT = `
	export default {
		async fetch(request, env) {
			const url = new URL(request.url);
			const key = url.searchParams.get("key") ?? "key";

			if (url.pathname === "/kv") {
				if (request.method === "PUT") {
					await env.KV.put(key, await request.text());
					return new Response("ok");
				}
				return new Response((await env.KV.get(key)) ?? "<null>");
			}

			if (url.pathname === "/r2") {
				if (request.method === "PUT") {
					await env.R2.put(key, await request.text());
					return new Response("ok");
				}
				const object = await env.R2.get(key);
				return new Response(object === null ? "<null>" : await object.text());
			}

			if (url.pathname === "/d1") {
				if (request.method === "PUT") {
					await env.DB.exec("CREATE TABLE IF NOT EXISTS items (value TEXT)");
					await env.DB.prepare("INSERT INTO items VALUES (?)")
						.bind(await request.text())
						.run();
					return new Response("ok");
				}
				try {
					const { results } = await env.DB.prepare("SELECT value FROM items").all();
					return Response.json(results);
				} catch {
					return Response.json([]);
				}
			}

			if (url.pathname === "/cache") {
				const cacheKey = "http://example.com/value";
				if (request.method === "PUT") {
					await caches.default.put(
						cacheKey,
						new Response(await request.text(), {
							headers: { "Cache-Control": "max-age=3600" },
						})
					);
					return new Response("ok");
				}
				const response = await caches.default.match(cacheKey);
				return new Response(response === undefined ? "<null>" : await response.text());
			}

			return new Response("not found", { status: 404 });
		}
	};
`;

interface MakeOptions {
	root: string;
	name: string;
	kvId?: string;
	r2Bucket?: string;
	d1Id?: string;
}

const instances: Miniflare[] = [];

function make({
	root,
	name,
	kvId = "kv",
	r2Bucket = "r2",
	d1Id = "d1",
}: MakeOptions): Miniflare {
	const options: MiniflareOptions = {
		resourcePersistencePath: root,
		unsafeDevRegistryPath: `${root}/.registry`,
		unsafeSharedStorageOwner: true,
		workers: [
			{
				config: {
					type: "worker",
					name,
					compatibilityDate: "2024-11-01",
					manifest: singleModuleManifest(SCRIPT),
					env: {
						KV: { type: "kv", id: kvId },
						R2: { type: "r2", name: r2Bucket },
						DB: { type: "d1", id: d1Id },
					},
				},
			},
		],
	};
	const instance = new Miniflare(options);
	instances.push(instance);
	return instance;
}

async function text(
	instance: Miniflare,
	path: string,
	init?: RequestInit
): Promise<string> {
	return (
		await instance.dispatchFetch(`http://example.com${path}`, init)
	).text();
}

afterEach(async () => {
	for (const instance of instances.splice(0).reverse()) {
		await instance.dispose().catch(() => {});
	}
});

describe.sequential("shared storage owner persistence", () => {
	test("instances sharing a persistence root share KV, R2, and D1", async ({
		expect,
	}) => {
		const root = await useTmp();
		const a = make({ root, name: "a" });
		const b = make({ root, name: "b" });
		await Promise.all([a.ready, b.ready]);

		expect(await text(a, "/kv", { method: "PUT", body: "kv-value" })).toBe(
			"ok"
		);
		expect(await text(b, "/kv")).toBe("kv-value");

		expect(await text(a, "/r2", { method: "PUT", body: "r2-value" })).toBe(
			"ok"
		);
		expect(await text(b, "/r2")).toBe("r2-value");

		expect(await text(a, "/d1", { method: "PUT", body: "d1-value" })).toBe(
			"ok"
		);
		expect(await text(b, "/d1")).toBe('[{"value":"d1-value"}]');
	});

	test("resources with different IDs remain isolated", async ({ expect }) => {
		const root = await useTmp();
		const a = make({
			root,
			name: "a",
			kvId: "kv-a",
			r2Bucket: "r2-a",
			d1Id: "d1-a",
		});
		const b = make({
			root,
			name: "b",
			kvId: "kv-b",
			r2Bucket: "r2-b",
			d1Id: "d1-b",
		});
		await Promise.all([a.ready, b.ready]);

		await text(a, "/kv", { method: "PUT", body: "kv-value" });
		await text(a, "/r2", { method: "PUT", body: "r2-value" });
		await text(a, "/d1", { method: "PUT", body: "d1-value" });

		expect(await text(b, "/kv")).toBe("<null>");
		expect(await text(b, "/r2")).toBe("<null>");
		expect(await text(b, "/d1")).toBe("[]");
	});

	test("cache storage remains local to each instance", async ({ expect }) => {
		const root = await useTmp();
		const a = make({ root, name: "a" });
		const b = make({ root, name: "b" });
		await Promise.all([a.ready, b.ready]);

		expect(
			await text(a, "/cache", { method: "PUT", body: "cache-value" })
		).toBe("ok");
		expect(await text(a, "/cache")).toBe("cache-value");
		expect(await text(b, "/cache")).toBe("<null>");
	});
});
