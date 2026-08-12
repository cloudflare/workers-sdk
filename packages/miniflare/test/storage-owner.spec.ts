import { readFileSync } from "node:fs";
import path from "node:path";
import { Miniflare } from "miniflare";
import { describe, it, vi } from "vitest";
import { singleModuleManifest, useTmp } from "./test-shared";
import type { MiniflareOptions } from "miniflare";

/** Recover the detached owner's pid from its log file (best-effort, tests only). */
function readOwnerPidFromLog(persistRoot: string): number | undefined {
	try {
		const log = readFileSync(
			path.join(persistRoot, ".miniflare-owner.log"),
			"utf8"
		);
		const match = log.match(/storage owner (\d+)/);
		return match ? Number(match[1]) : undefined;
	} catch {
		return undefined;
	}
}

describe.sequential("owner presence integration", () => {
	it("routes a client's KV through the owner so storage is shared", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const KV_WORKER = `export default {
			async fetch(request, env) {
				const url = new URL(request.url);
				const key = url.searchParams.get("key") ?? "k";
				if (request.method === "PUT") {
					await env.NS.put(key, await request.text());
					return new Response("ok");
				}
				const val = await env.NS.get(key);
				return new Response(val ?? "<null>");
			}
		}`;
		const common: MiniflareOptions = {
			unsafeEnableSharedStorage: true,
			resourcePersistencePath: persistRoot,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "worker",
						compatibilityDate: "2025-01-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(KV_WORKER),
						env: { NS: { type: "kv", id: "NS" } },
					},
				},
			],
		};

		const owner = new Miniflare(common);
		await owner.ready;
		const client = new Miniflare(common);

		try {
			await client.ready;

			// Write through the client (which routes to the owner).
			const putRes = await client.dispatchFetch("http://x/?key=greeting", {
				method: "PUT",
				body: "hello-from-client",
			});
			expect(await putRes.text()).toBe("ok");

			// The owner can read what the client wrote → storage is shared.
			const ownerRes = await owner.dispatchFetch("http://x/?key=greeting");
			expect(await ownerRes.text()).toBe("hello-from-client");

			// And the client can read it back through the proxy.
			const clientRes = await client.dispatchFetch("http://x/?key=greeting");
			expect(await clientRes.text()).toBe("hello-from-client");
		} finally {
			await client.dispose();
			await owner.dispose();
		}
	});

	it("an explicit owner hosts plugins absent from its user config", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const owner = new Miniflare({
			unsafeEnableSharedStorage: true,
			resourcePersistencePath: persistRoot,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "owner",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							"export default { fetch() { return new Response('owner'); } }"
						),
						env: { NS: { type: "kv", id: "NS" } },
					},
				},
			],
		});
		await owner.ready;
		const client = new Miniflare({
			unsafeEnableSharedStorage: true,
			resourcePersistencePath: persistRoot,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "client",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(`export default {
			async fetch(request, env) {
				await env.DB.prepare("CREATE TABLE IF NOT EXISTS t(v TEXT)").run();
				return new Response("ok");
			}
		}`),
						env: { DB: { type: "d1", id: "DB" } },
					},
				},
			],
		});

		try {
			await client.ready;
			expect(await (await client.dispatchFetch("http://x/")).text()).toBe("ok");
		} finally {
			await client.dispose();
			await owner.dispose();
		}
	});

	it("routes a client's R2 and D1 through the owner so storage is shared", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const WORKER = `export default {
			async fetch(request, env) {
				const url = new URL(request.url);
				const kind = url.searchParams.get("kind");
				if (kind === "r2") {
					if (request.method === "PUT") {
						await env.BUCKET.put("obj", await request.text());
						return new Response("ok");
					}
					const o = await env.BUCKET.get("obj");
					return new Response(o ? await o.text() : "<null>");
				}
				// d1
				if (request.method === "PUT") {
					await env.DB.prepare("CREATE TABLE IF NOT EXISTS t(v TEXT)").run();
					await env.DB.prepare("INSERT INTO t(v) VALUES (?)").bind(await request.text()).run();
					return new Response("ok");
				}
				const { results } = await env.DB.prepare("SELECT v FROM t").all();
				return new Response(JSON.stringify(results.map((r) => r.v)));
			}
		}`;
		const common: MiniflareOptions = {
			unsafeEnableSharedStorage: true,
			resourcePersistencePath: persistRoot,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "worker",
						compatibilityDate: "2025-01-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(WORKER),
						env: {
							BUCKET: { type: "r2", name: "BUCKET" },
							DB: { type: "d1", id: "DB" },
						},
					},
				},
			],
		};
		const owner = new Miniflare(common);
		await owner.ready;
		const client = new Miniflare(common);

		try {
			await client.ready;

			// R2: client write → owner read.
			expect(
				await (
					await client.dispatchFetch("http://x/?kind=r2", {
						method: "PUT",
						body: "r2-from-client",
					})
				).text()
			).toBe("ok");
			expect(
				await (await owner.dispatchFetch("http://x/?kind=r2")).text()
			).toBe("r2-from-client");
			expect(
				await (
					await client.dispatchFetch(
						"http://x/cdn-cgi/local/r2/public/BUCKET/obj"
					)
				).text()
			).toBe("r2-from-client");

			// D1: client write → owner read.
			expect(
				await (
					await client.dispatchFetch("http://x/?kind=d1", {
						method: "PUT",
						body: "d1-from-client",
					})
				).text()
			).toBe("ok");
			expect(
				await (await owner.dispatchFetch("http://x/?kind=d1")).text()
			).toBe(JSON.stringify(["d1-from-client"]));
		} finally {
			await client.dispose();
			await owner.dispose();
		}
	});

	it.todo(
		"routes a client's Stream through the owner over RPC so storage is shared",
		async ({ expect }) => {
			const persistRoot = await useTmp();
			const registryPath = await useTmp();
			// Exercises the JSRPC path of the owner boundary (native RPC over the debug
			// port), including nested RpcTargets (`videos.list()`).
			const WORKER = `export default {
			async fetch(request, env) {
				try {
					if (request.method === "PUT") {
						const body = new Response(
							new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
						).body;
						const video = await env.STREAM.upload(body, {});
						return Response.json({ id: video.id });
					}
					const videos = await env.STREAM.videos.list();
					return Response.json({ count: videos.length });
				} catch (e) {
					return Response.json({ error: String(e && e.stack || e) }, { status: 500 });
				}
			}
		}`;
			const common: MiniflareOptions = {
				unsafeEnableSharedStorage: true,
				resourcePersistencePath: persistRoot,
				unsafeDevRegistryPath: registryPath,
				workers: [
					{
						config: {
							type: "worker",
							name: "worker",
							compatibilityDate: "2025-01-01",
							compatibilityFlags: ["experimental"],
							manifest: singleModuleManifest(WORKER),
							env: { STREAM: { type: "stream" } },
						},
					},
				],
			};
			const owner = new Miniflare(common);
			await owner.ready;
			const client = new Miniflare(common);

			try {
				await client.ready;

				// Client uploads a video (RPC through the owner)...
				const put = (await (
					await client.dispatchFetch("http://x/", { method: "PUT" })
				).json()) as { id: string };
				expect(put.id).toBeTruthy();

				// ...and the owner sees it (shared store), proving the RPC round-trip
				// and the shared backing storage.
				expect(
					(
						(await (await owner.dispatchFetch("http://x/")).json()) as {
							count: number;
						}
					).count
				).toBe(1);
			} finally {
				await client.dispose();
				await owner.dispose();
			}
		}
	);

	it("routes a client's Secrets Store secret through the owner over RPC", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const WORKER = `export default {
			async fetch(request, env) {
				try {
					return new Response(await env.SECRET.get());
				} catch (e) {
					return new Response(e.message, { status: 404 });
				}
			}
		}`;
		const common: MiniflareOptions = {
			unsafeEnableSharedStorage: true,
			resourcePersistencePath: persistRoot,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "worker",
						compatibilityDate: "2025-01-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(WORKER),
						env: {
							SECRET: {
								type: "secrets-store-secret",
								storeId: "store_a",
								secretName: "api_key",
							},
						},
					},
				},
			],
		};
		const owner = new Miniflare(common);
		await owner.ready;
		const client = new Miniflare(common);

		try {
			await client.ready;

			// Seed the secret value on the owner (which holds the local store)...
			await (
				await owner.getSecretsStoreSecretAPI("SECRET")
			)().create("super-secret");

			// ...and the client reads it back over the routed RPC binding.
			expect(await (await client.dispatchFetch("http://x/")).text()).toBe(
				"super-secret"
			);
		} finally {
			await client.dispose();
			await owner.dispose();
		}
	});

	it.todo(
		"routes a client's Images store to the owner without dangling services",
		async ({ expect }) => {
			const persistRoot = await useTmp();
			const registryPath = await useTmp();
			const common: MiniflareOptions = {
				unsafeEnableSharedStorage: true,
				resourcePersistencePath: persistRoot,
				unsafeDevRegistryPath: registryPath,
				workers: [
					{
						config: {
							type: "worker",
							name: "worker",
							compatibilityDate: "2025-01-01",
							compatibilityFlags: ["experimental"],
							manifest: singleModuleManifest(
								"export default { async fetch(_request, env) { return new Response(typeof env.IMAGES.info); } }"
							),
							env: { IMAGES: { type: "images" } },
						},
					},
				],
			};
			const owner = new Miniflare(common);
			const client = new Miniflare(common);
			try {
				// Both reaching `ready` proves the routed client doesn't reference a
				// local images storage service it no longer stands up (the owner does),
				// and the transform worker + its routed `IMAGES_STORE` binding resolve.
				await owner.ready;
				await client.ready;
				expect(await (await client.dispatchFetch("http://x/")).text()).toBe(
					"function"
				);
			} finally {
				await client.dispose();
				await owner.dispose();
			}
		}
	);

	it("hosts plugins and resources not used by the client that spawned it", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();

		const first = new Miniflare({
			unsafeEnableSharedStorage: true,
			resourcePersistencePath: persistRoot,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "first",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(
							"export default { fetch() { return new Response('first'); } }"
						),
						env: { NS: { type: "kv", id: "NS" } },
					},
				},
			],
		});
		let second: Miniflare | undefined;

		try {
			await first.ready;

			second = new Miniflare({
				unsafeEnableSharedStorage: true,
				resourcePersistencePath: persistRoot,
				unsafeDevRegistryPath: registryPath,
				workers: [
					{
						config: {
							type: "worker",
							name: "second",
							compatibilityDate: "2025-01-01",
							compatibilityFlags: ["experimental"],
							manifest: singleModuleManifest(`export default {
				async fetch(request, env) {
					if (new URL(request.url).pathname === "/secret") {
						return new Response(await env.SECRET.get());
					}
					if (request.method === "PUT") {
						await env.DB.prepare("CREATE TABLE IF NOT EXISTS t(v TEXT)").run();
						await env.DB.prepare("INSERT INTO t(v) VALUES (?)").bind(await request.text()).run();
						return new Response("ok");
					}
					const row = await env.DB.prepare("SELECT v FROM t").first();
					return new Response(row?.v ?? "<null>");
				}
			}`),
							env: {
								DB: { type: "d1", id: "later-db" },
								SECRET: {
									type: "secrets-store-secret",
									storeId: "later-store",
									secretName: "later-secret",
								},
							},
						},
					},
				],
			});
			await second.ready;

			expect(
				await (
					await second.dispatchFetch("http://x/", {
						method: "PUT",
						body: "from-second",
					})
				).text()
			).toBe("ok");
			expect(await (await second.dispatchFetch("http://x/")).text()).toBe(
				"from-second"
			);

			await (
				await second.getSecretsStoreSecretAPI("SECRET")
			)().create("secret-from-second");
			expect(await (await second.dispatchFetch("http://x/secret")).text()).toBe(
				"secret-from-second"
			);
		} finally {
			await second?.dispose().catch(() => {});
			await first.dispose().catch(() => {});
		}
	});

	it("lets many client instances write one D1 concurrently without contention", async ({
		expect,
	}) => {
		// This is the scenario that produces cross-process SQLITE_BUSY today: many
		// processes opening the same SQLite file. With a shared owner, only the
		// owner opens it, so concurrent writes from all clients succeed.
		const persistRoot = await useTmp();
		const registryPath = await useTmp();

		const N = 30; // client instances
		const M = 20; // inserts per client
		const WORKER = `export default {
			async fetch(request, env) {
				const url = new URL(request.url);
				if (url.searchParams.get("init") === "1") {
					await env.DB.prepare("CREATE TABLE IF NOT EXISTS t(v INTEGER)").run();
					return new Response("ok");
				}
				if (request.method === "PUT") {
					await env.DB.prepare("INSERT INTO t(v) VALUES (1)").run();
					return new Response("ok");
				}
				const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM t").first();
				return new Response(String(row.c));
			}
		}`;
		const make = () =>
			new Miniflare({
				unsafeEnableSharedStorage: true,
				resourcePersistencePath: persistRoot,
				unsafeDevRegistryPath: registryPath,
				workers: [
					{
						config: {
							type: "worker",
							name: "worker",
							compatibilityDate: "2025-01-01",
							compatibilityFlags: ["experimental"],
							manifest: singleModuleManifest(WORKER),
							env: { DB: { type: "d1", id: "DB" } },
						},
					},
				],
			});

		const clients = Array.from({ length: N }, make);
		try {
			await Promise.all(clients.map((c) => c.ready));

			// Create the table once, then hammer it concurrently from every client.
			await clients[0].dispatchFetch("http://x/?init=1").then((r) => r.text());

			const results = await Promise.all(
				clients.flatMap((c) =>
					Array.from({ length: M }, async () => {
						const r = await c.dispatchFetch("http://x/", { method: "PUT" });
						await r.text(); // consume body
						return r.status;
					})
				)
			);
			// No request failed (e.g. with a 500 from SQLITE_BUSY).
			expect(results.every((s) => s === 200)).toBe(true);

			// All writes landed — no lost updates, no contention failures.
			const count = await clients[0]
				.dispatchFetch("http://x/")
				.then((r) => r.text());
			expect(count).toBe(String(N * M));
		} finally {
			await Promise.all(clients.map((c) => c.dispose().catch(() => {})));
		}
	});

	it("does nothing when the feature flag is off", async ({ expect }) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const mf = new Miniflare({
			resourcePersistencePath: persistRoot,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "worker",
						compatibilityDate: "2025-05-01",
						compatibilityFlags: ["experimental"],
						manifest: singleModuleManifest(
							"export default { async fetch() { return new Response('plain'); } }"
						),
					},
				},
			],
		});
		await mf.ready;

		await mf.dispose();
	});
});
