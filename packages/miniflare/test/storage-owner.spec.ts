import { Miniflare } from "miniflare";
import { describe, it, vi } from "vitest";
import { singleModuleManifest, useTmp } from "./test-shared";
import type { MiniflareOptions } from "miniflare";

async function withIsolatedStorage(
	options: MiniflareOptions
): Promise<MiniflareOptions> {
	return {
		...options,
		isolatedResourcePersistencePath: await useTmp(),
	};
}

describe.sequential("owner presence integration", () => {
	it("requires persistence and a dev registry", ({ expect }) => {
		const worker = {
			config: {
				type: "worker" as const,
				name: "worker",
				compatibilityDate: "2025-01-01",
			},
		};
		expect(
			() =>
				new Miniflare({
					unsafeEnableSharedStorage: true,
					unsafeDevRegistryPath: ".registry",
					workers: [worker],
				})
		).toThrow(
			"Shared storage requires `resourcePersistencePath` to be set to the directory instances should share."
		);
		expect(
			() =>
				new Miniflare({
					unsafeEnableSharedStorage: true,
					resourcePersistencePath: ".state",
					workers: [worker],
				})
		).toThrow(
			"Shared storage requires `unsafeDevRegistryPath` to be set, as instances elect a storage owner through the dev registry."
		);
		expect(
			() =>
				new Miniflare({
					unsafeEnableSharedStorage: true,
					resourcePersistencePath: ".state",
					unsafeDevRegistryPath: ".registry",
					workers: [worker],
				})
		).toThrow(
			"Shared storage requires `isolatedResourcePersistencePath` to be set to a per-project directory, for resources that cannot be shared."
		);
	});

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

		const owner = new Miniflare(await withIsolatedStorage(common));
		await owner.ready;
		const client = new Miniflare(await withIsolatedStorage(common));

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
		const owner = new Miniflare(
			await withIsolatedStorage({
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
			})
		);
		await owner.ready;
		const client = new Miniflare(
			await withIsolatedStorage({
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
			})
		);

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
		const owner = new Miniflare(await withIsolatedStorage(common));
		await owner.ready;
		const client = new Miniflare(await withIsolatedStorage(common));

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

	it("routes a client's Stream through the owner over RPC so storage is shared", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		// Exercises the JSRPC path of the owner boundary (native RPC over the debug
		// port), including nested RpcTargets (`videos.list()`).
		const WORKER = `export default {
			async fetch(request, env) {
				try {
					const url = new URL(request.url);
					if (url.pathname === "/video") {
						const video = env.STREAM.video(url.searchParams.get("id"));
						return Response.json({
							details: await video.details(),
							captions: await video.captions.list(),
							downloads: await video.downloads.get(),
						});
					}
					if (url.pathname === "/watermark") {
						const id = url.searchParams.get("id");
						if (request.method === "POST") {
							const body = new Response(new Uint8Array([0, 1, 2, 3])).body;
							return Response.json(await env.STREAM.watermarks.generate(body, { name: "shared" }));
						}
						if (request.method === "DELETE" && id !== null) {
							await env.STREAM.watermarks.delete(id);
							return Response.json({ count: (await env.STREAM.watermarks.list()).length });
						}
						return Response.json(id === null
							? { count: (await env.STREAM.watermarks.list()).length }
							: await env.STREAM.watermarks.get(id));
					}
					if (request.method === "PUT") {
						const body = new Response(
							new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
						).body;
						const video = await env.STREAM.upload(body, {});
						return Response.json(video);
					}
					const videos = await env.STREAM.videos.list();
					return Response.json({ count: videos.length, preview: videos[0]?.preview });
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
		const owner = new Miniflare(await withIsolatedStorage(common));
		const ownerUrl = await owner.ready;
		const client = new Miniflare(await withIsolatedStorage(common));

		try {
			const clientUrl = await client.ready;

			// Client uploads a video (RPC through the owner)...
			const put = (await (
				await client.dispatchFetch("http://x/", { method: "PUT" })
			).json()) as { id: string; preview: string };
			expect(put.id).toBeTruthy();
			expect(new URL(put.preview).origin).toBe(ownerUrl.origin);

			// Resolve the nested `videos` RPC target through the client too.
			const listed = (await (
				await client.dispatchFetch("http://x/")
			).json()) as { count?: number; preview?: string; error?: string };
			expect(listed).toEqual({ count: 1, preview: put.preview });

			const targets = (await (
				await client.dispatchFetch(`http://x/video?id=${put.id}`)
			).json()) as {
				details: typeof put;
				captions: unknown[];
				downloads: Record<string, unknown>;
			};
			expect(targets).toEqual({
				details: put,
				captions: [],
				downloads: {},
			});

			const watermark = (await (
				await client.dispatchFetch("http://x/watermark", { method: "POST" })
			).json()) as { id: string; name: string };
			expect(watermark.name).toBe("shared");
			expect(
				await (
					await client.dispatchFetch(`http://x/watermark?id=${watermark.id}`)
				).json()
			).toMatchObject(watermark);
			expect(
				await (await client.dispatchFetch("http://x/watermark")).json()
			).toEqual({ count: 1 });
			expect(
				await (
					await client.dispatchFetch(`http://x/watermark?id=${watermark.id}`, {
						method: "DELETE",
					})
				).json()
			).toEqual({ count: 0 });

			const videoResponse = await fetch(put.preview);
			expect(videoResponse.status).toBe(200);
			expect(new Uint8Array(await videoResponse.arrayBuffer())).toEqual(
				new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
			);

			await owner.dispose();
			let failedOverPreview = "";
			await vi.waitFor(
				async () => {
					const response = await client.dispatchFetch("http://x/");
					const result = (await response.json()) as {
						count?: number;
						preview?: string;
						error?: string;
					};
					expect(result.count).toBe(1);
					expect(result.preview).toBeTruthy();
					if (result.preview !== undefined) {
						failedOverPreview = result.preview;
						expect(new URL(result.preview).origin).toBe(clientUrl.origin);
					}
				},
				{ timeout: 10_000, interval: 100 }
			);

			const failedOverVideoResponse = await fetch(failedOverPreview);
			expect(failedOverVideoResponse.status).toBe(200);
			expect(
				new Uint8Array(await failedOverVideoResponse.arrayBuffer())
			).toEqual(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
		} finally {
			await client.dispose().catch(() => {});
			await owner.dispose().catch(() => {});
		}
	});

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
		const owner = new Miniflare(await withIsolatedStorage(common));
		await owner.ready;
		const client = new Miniflare(await withIsolatedStorage(common));

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

	it("routes a client's Images store to the owner without dangling services", async ({
		expect,
	}) => {
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
						manifest: singleModuleManifest(`export default {
			async fetch(request, env) {
				if (request.method === "PUT") {
					return Response.json(await env.IMAGES.hosted.upload(
						await request.arrayBuffer(),
						{ id: "shared-image" }
					));
				}
				const stream = await env.IMAGES.hosted.image("shared-image").bytes();
				return new Response(stream, { status: stream === null ? 404 : 200 });
			}
		}`),
						env: { IMAGES: { type: "images" } },
					},
				},
			],
		};
		const owner = new Miniflare(await withIsolatedStorage(common));
		const client = new Miniflare(await withIsolatedStorage(common));
		try {
			await owner.ready;
			await client.ready;
			const bytes = new Uint8Array([1, 2, 3, 4, 5]);
			const upload = await client.dispatchFetch("http://x/", {
				method: "PUT",
				body: bytes,
			});
			await upload.json();
			expect(upload.status).toBe(200);

			expect(
				new Uint8Array(
					await (await owner.dispatchFetch("http://x/")).arrayBuffer()
				)
			).toEqual(bytes);
			const delivery = await client.dispatchFetch(
				"http://x/__cf_local/imagedelivery/shared-image/public"
			);
			expect(delivery.status).toBe(200);
			expect(new Uint8Array(await delivery.arrayBuffer())).toEqual(bytes);
		} finally {
			await client.dispose();
			await owner.dispose();
		}
	});

	it("hosts plugins and resources not used by the client that spawned it", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();

		const first = new Miniflare(
			await withIsolatedStorage({
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
			})
		);
		let second: Miniflare | undefined;

		try {
			await first.ready;

			second = new Miniflare(
				await withIsolatedStorage({
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
				})
			);
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

		const N = 10; // client instances
		const M = 10; // inserts per client
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
		const make = async () =>
			new Miniflare(
				await withIsolatedStorage({
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
				})
			);

		const clients = await Promise.all(Array.from({ length: N }, make));
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
	}, 30_000);

	it("hands storage ownership to another live instance", async ({ expect }) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const options: MiniflareOptions = {
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
						manifest: singleModuleManifest(`export default {
				async fetch(request, env) {
					await env.DB.prepare("CREATE TABLE IF NOT EXISTS t(v TEXT)").run();
					if (request.method === "PUT") {
						await env.DB.prepare("INSERT INTO t(v) VALUES (?)").bind(await request.text()).run();
					}
					const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM t").first();
					return new Response(String(row.c));
				}
			}`),
						env: { DB: { type: "d1", id: "DB" } },
					},
				},
			],
		};
		const first = new Miniflare(await withIsolatedStorage(options));
		let second: Miniflare | undefined;

		try {
			await first.ready;
			second = new Miniflare(await withIsolatedStorage(options));
			await second.ready;

			expect(
				await (
					await second.dispatchFetch("http://x/", {
						method: "PUT",
						body: "before",
					})
				).text()
			).toBe("1");

			await first.dispose();
			await vi.waitFor(
				async () => {
					const response = await second?.dispatchFetch("http://x/");
					const body = await response?.text();
					expect([response?.status, body]).toEqual([200, "1"]);
				},
				{ timeout: 10_000, interval: 100 }
			);
			expect(
				await (
					await second.dispatchFetch("http://x/", {
						method: "PUT",
						body: "after",
					})
				).text()
			).toBe("2");
		} finally {
			await second?.dispose().catch(() => {});
			await first.dispose().catch(() => {});
		}
	});

	it("elects independent owners for different persistence roots", async ({
		expect,
	}) => {
		const registryPath = await useTmp();
		const WORKER = `export default {
			async fetch(request, env) {
				await env.DB.prepare("CREATE TABLE IF NOT EXISTS t(v TEXT)").run();
				if (request.method === "PUT") {
					await env.DB.prepare("INSERT INTO t(v) VALUES (?)").bind(await request.text()).run();
				}
				const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM t").first();
				return new Response(String(row.c));
			}
		}`;
		const make = async (name: string) =>
			new Miniflare(
				await withIsolatedStorage({
					unsafeEnableSharedStorage: true,
					resourcePersistencePath: await useTmp(),
					unsafeDevRegistryPath: registryPath,
					workers: [
						{
							config: {
								type: "worker",
								name,
								compatibilityDate: "2025-01-01",
								compatibilityFlags: ["experimental"],
								manifest: singleModuleManifest(WORKER),
								env: { DB: { type: "d1", id: "DB" } },
							},
						},
					],
				})
			);
		const first = await make("first");
		const second = await make("second");

		try {
			await first.ready;
			await second.ready;
			for (const instance of [first, second]) {
				expect(
					await (
						await instance.dispatchFetch("http://x/", {
							method: "PUT",
							body: "value",
						})
					).text()
				).toBe("1");
			}
		} finally {
			await Promise.all([first.dispose(), second.dispose()]);
		}
	});

	it("persists isolated resources across restarts", async ({ expect }) => {
		const persistRoot = await useTmp();
		const isolatedRoot = await useTmp();
		const registryPath = await useTmp();
		const options: MiniflareOptions = {
			unsafeEnableSharedStorage: true,
			resourcePersistencePath: persistRoot,
			isolatedResourcePersistencePath: isolatedRoot,
			unsafeDevRegistryPath: registryPath,
			workers: [
				{
					config: {
						type: "worker",
						name: "worker",
						compatibilityDate: "2025-01-01",
						manifest: singleModuleManifest(`export default {
			async fetch(request) {
				const key = new Request("http://cache/key");
				if (request.method === "PUT") {
					await caches.default.put(
						key,
						new Response(await request.text(), {
							headers: { "Cache-Control": "max-age=3600" },
						})
					);
					return new Response("ok");
				}
				return (await caches.default.match(key)) ?? new Response("missing");
			}
		}`),
					},
				},
			],
		};

		const first = new Miniflare(options);
		await first.ready;
		expect(
			await (
				await first.dispatchFetch("http://x/", {
					method: "PUT",
					body: "persisted",
				})
			).text()
		).toBe("ok");
		expect(await (await first.dispatchFetch("http://x/")).text()).toBe(
			"persisted"
		);
		await first.dispose();

		const restarted = new Miniflare(options);
		try {
			await restarted.ready;
			expect(await (await restarted.dispatchFetch("http://x/")).text()).toBe(
				"persisted"
			);
		} finally {
			await restarted.dispose();
		}
	});

	it("does nothing when the feature flag is off", async () => {
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
