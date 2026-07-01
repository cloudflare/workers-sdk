// Validates whether the existing `defaultPersistRoot` option is sufficient to
// make storage bindings behave as singletons across multiple Miniflare
// instances (e.g. separate `wrangler dev` / `vite dev` sessions).
//
// Each `Miniflare` instance spawns its own `workerd` subprocess, so two
// instances in the same Node process still exercise genuine cross-process
// access to the same on-disk SQLite databases and blob files.
//
// These tests deliberately use NO special concurrency handling (no busy-timeout
// retries, no sticky blobs, no owner election). They characterise the
// out-of-the-box behaviour of a shared `defaultPersistRoot`.

import { Miniflare } from "miniflare";
import { afterEach, describe, test } from "vitest";
import { useTmp } from "./test-shared";
import type { MiniflareOptions } from "miniflare";

const COMPAT_DATE = "2024-11-01";

// When set, route storage through a single shared owner process (all instances
// sharing a `defaultPersistRoot` elect one owner). Tests branch on this where
// shared-owner semantics intentionally differ from plain `defaultPersistRoot`
// (notably: cache is kept per-instance, not shared).
const sharedOwner = process.env.MINIFLARE_TEST_SHARED_OWNER === "1";

const NOOP_SCRIPT = `export default { async fetch() { return new Response("ok"); } };`;

interface MakeOptions {
	root: string;
	name?: string;
	kvId?: string;
	r2Bucket?: string;
	d1Id?: string;
	script?: string;
	durableObjects?: Record<string, string>;
	/** Explicit `kvPersist` path, to test precedence over `defaultPersistRoot`. */
	kvPersist?: string;
	/** Configure a Stream binding (`STREAM`). */
	stream?: boolean;
	/** Configure an Images binding (`IMAGES`). */
	images?: boolean;
	/** Configure a Secrets Store secret binding (`SECRET`). */
	secret?: { store_id: string; secret_name: string };
}

const instances: Miniflare[] = [];

function make({
	root,
	name,
	kvId,
	r2Bucket,
	d1Id,
	script,
	durableObjects,
	kvPersist,
	stream,
	images,
	secret,
}: MakeOptions): Miniflare {
	const opts: MiniflareOptions = {
		name,
		defaultPersistRoot: root,
		modules: true,
		script: script ?? NOOP_SCRIPT,
		compatibilityDate: COMPAT_DATE,
		kvNamespaces: kvId !== undefined ? { KV: kvId } : {},
		r2Buckets: r2Bucket !== undefined ? { R2: r2Bucket } : {},
		d1Databases: d1Id !== undefined ? { DB: d1Id } : {},
		durableObjects,
		cache: true,
		kvPersist,
		...(stream ? { stream: { binding: "STREAM" } } : {}),
		...(images ? { images: { binding: "IMAGES" } } : {}),
		...(secret ? { secretsStoreSecrets: { SECRET: secret } } : {}),
		unsafeSharedStorageOwner: sharedOwner || undefined,
		unsafeDevRegistryPath: sharedOwner ? `${root}/.registry` : undefined,
	};
	const mf = new Miniflare(opts);
	instances.push(mf);
	return mf;
}

afterEach(async () => {
	// Dispose in reverse creation order; tolerate already-disposed instances.
	const toDispose = instances.splice(0, instances.length).reverse();
	for (const mf of toDispose) {
		try {
			await mf.dispose();
		} catch {}
	}
});

describe.sequential("defaultPersistRoot sharing", () => {
	// --------------------------------------------------------------- Host API
	// One smoke test that the documented host-side helper API (getKVNamespace,
	// etc.) also observes shared storage across instances. The worker-driven
	// tests below exercise the real binding code paths in depth.
	describe("host API access", () => {
		test("host-side getKVNamespace in B sees a write from A", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = make({ root, name: "a", kvId: "ns" });
			const b = make({ root, name: "b", kvId: "ns" });
			await a.ready;
			await b.ready;
			const kvA = await a.getKVNamespace("KV");
			const kvB = await b.getKVNamespace("KV");

			await kvA.put("key", "value-from-a");
			expect(await kvB.get("key")).toBe("value-from-a");
		});
	});

	// --------------------------------------------------------------- Isolation
	// Storage must be shared ONLY when the same id/path is used. These guard the
	// keying / persist-path scheme against accidental collisions or over-sharing.
	describe("isolation (not shared)", () => {
		test("KV: different namespace ids are not shared", async ({ expect }) => {
			const root = await useTmp();
			const a = make({ root, name: "a", kvId: "ns-a" });
			const b = make({ root, name: "b", kvId: "ns-b" });
			await a.ready;
			await b.ready;
			const kvA = await a.getKVNamespace("KV");
			const kvB = await b.getKVNamespace("KV");

			await kvA.put("k", "v");
			expect(await kvB.get("k")).toBe(null);
		});

		test("KV: different defaultPersistRoot is not shared", async ({
			expect,
		}) => {
			const rootA = await useTmp();
			const rootB = await useTmp();
			const a = make({ root: rootA, name: "a", kvId: "ns" });
			const b = make({ root: rootB, name: "b", kvId: "ns" });
			await a.ready;
			await b.ready;
			const kvA = await a.getKVNamespace("KV");
			const kvB = await b.getKVNamespace("KV");

			await kvA.put("k", "v");
			expect(await kvB.get("k")).toBe(null);
		});

		test("KV: explicit kvPersist overrides defaultPersistRoot (precedence)", async ({
			expect,
		}) => {
			const root = await useTmp();
			const kvOnly = await useTmp();
			// A uses an explicit kvPersist path; B uses the shared default root.
			const a = make({ root, name: "a", kvId: "ns", kvPersist: kvOnly });
			const b = make({ root, name: "b", kvId: "ns" });
			await a.ready;
			await b.ready;
			const kvA = await a.getKVNamespace("KV");
			const kvB = await b.getKVNamespace("KV");

			await kvA.put("k", "v");
			// Not shared: A wrote to its own kvPersist location.
			expect(await kvB.get("k")).toBe(null);
		});

		test("R2: different bucket names are not shared", async ({ expect }) => {
			const root = await useTmp();
			const a = make({ root, name: "a", r2Bucket: "bucket-a" });
			const b = make({ root, name: "b", r2Bucket: "bucket-b" });
			await a.ready;
			await b.ready;
			const r2A = await a.getR2Bucket("R2");
			const r2B = await b.getR2Bucket("R2");

			await r2A.put("obj", "data");
			expect(await r2B.head("obj")).toBe(null);
		});

		test("D1: different database ids are not shared", async ({ expect }) => {
			const root = await useTmp();
			const a = make({ root, name: "a", d1Id: "db-a" });
			const b = make({ root, name: "b", d1Id: "db-b" });
			await a.ready;
			await b.ready;
			const dbA = await a.getD1Database("DB");
			const dbB = await b.getD1Database("DB");

			await dbA.exec("CREATE TABLE t (x INTEGER);");
			await dbA.prepare("INSERT INTO t (x) VALUES (1)").run();
			// B's database should not have the table at all.
			await expect(dbB.prepare("SELECT * FROM t").all()).rejects.toThrow();
		});
	});

	// ---------------------------------------------------------- Runtime code paths
	describe("runtime code paths", () => {
		const STORAGE_WORKER_SCRIPT = `
			export default {
				async fetch(request, env) {
					const url = new URL(request.url);
					const key = url.searchParams.get("key") ?? "key";
					if (url.pathname === "/kv") {
						if (request.method === "PUT") {
							await env.KV.put(key, await request.text(), {
								metadata: { source: url.searchParams.get("source") ?? "worker" },
							});
							return new Response("ok");
						}
						const result = await env.KV.getWithMetadata(key);
						return Response.json(result);
					}

					if (url.pathname === "/r2") {
						if (request.method === "PUT") {
							await env.R2.put(key, await request.text(), {
								customMetadata: { source: url.searchParams.get("source") ?? "worker" },
							});
							return new Response("ok");
						}
						const object = await env.R2.get(key);
						if (object === null) {
							return Response.json(null);
						}
						return Response.json({
							value: await object.text(),
							customMetadata: object.customMetadata,
						});
					}

					if (url.pathname === "/d1/init") {
						await env.DB.exec("CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, name TEXT)");
						return new Response("ok");
					}
					if (url.pathname === "/d1/insert") {
						await env.DB.prepare("INSERT INTO items (name) VALUES (?)")
							.bind(url.searchParams.get("name"))
							.run();
						return new Response("ok");
					}
					if (url.pathname === "/d1") {
						return Response.json(await env.DB.prepare("SELECT name FROM items ORDER BY name").all());
					}

					if (url.pathname === "/cache") {
						const cacheUrl = url.searchParams.get("url") ?? "http://example.com/cache";
						if (request.method === "PUT") {
							await caches.default.put(
								cacheUrl,
								new Response(await request.text(), {
									headers: { "Cache-Control": "max-age=3600" },
								})
							);
							return new Response("ok");
						}
						const response = await caches.default.match(cacheUrl);
						return new Response(response === undefined ? "<null>" : await response.text());
					}

					return new Response("not found", { status: 404 });
				}
			};
		`;

		test("Worker handlers share KV, R2, D1 and Cache state", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = make({
				root,
				name: "a",
				kvId: "ns",
				r2Bucket: "bucket",
				d1Id: "db",
				script: STORAGE_WORKER_SCRIPT,
			});
			const b = make({
				root,
				name: "b",
				kvId: "ns",
				r2Bucket: "bucket",
				d1Id: "db",
				script: STORAGE_WORKER_SCRIPT,
			});
			await a.ready;
			await b.ready;

			await (
				await a.dispatchFetch("http://x/kv?key=from-worker&source=a", {
					method: "PUT",
					body: "kv-value",
				})
			).text();
			const kvResult = (await (
				await b.dispatchFetch("http://x/kv?key=from-worker")
			).json()) as { value: string | null; metadata: unknown };
			expect(kvResult).toMatchObject({
				value: "kv-value",
				metadata: { source: "a" },
			});

			await (
				await a.dispatchFetch("http://x/r2?key=from-worker&source=a", {
					method: "PUT",
					body: "r2-value",
				})
			).text();
			const r2Result = (await (
				await b.dispatchFetch("http://x/r2?key=from-worker")
			).json()) as { value: string; customMetadata: unknown };
			expect(r2Result).toEqual({
				value: "r2-value",
				customMetadata: { source: "a" },
			});

			await (await a.dispatchFetch("http://x/d1/init")).text();
			await (await a.dispatchFetch("http://x/d1/insert?name=a")).text();
			await (await b.dispatchFetch("http://x/d1/insert?name=b")).text();
			const d1Result = (await (
				await a.dispatchFetch("http://x/d1")
			).json()) as { results: { name: string }[] };
			expect(d1Result.results).toEqual([{ name: "a" }, { name: "b" }]);

			await (
				await a.dispatchFetch(
					"http://x/cache?url=http://example.com/from-worker",
					{
						method: "PUT",
						body: "cache-value",
					}
				)
			).text();
			const cacheFromB = await (
				await b.dispatchFetch(
					"http://x/cache?url=http://example.com/from-worker"
				)
			).text();
			// Cache is intentionally NOT shared through the storage owner: each
			// instance keeps its own local cache (evictions are recoverable), so in
			// shared-owner mode B does not observe A's cache write.
			expect(cacheFromB).toBe(sharedOwner ? "<null>" : "cache-value");
		});

		// Regression test: once two instances share a persist root, concurrent writes
		// from user Worker code used to surface as 500 responses from the KV simulator
		// (cross-process SQLITE_BUSY / read-only fallback). They must now all succeed.
		test("Worker handlers can concurrently write shared KV without failed responses", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = make({
				root,
				name: "a",
				kvId: "ns",
				script: STORAGE_WORKER_SCRIPT,
			});
			const b = make({
				root,
				name: "b",
				kvId: "ns",
				script: STORAGE_WORKER_SCRIPT,
			});
			await a.ready;
			await b.ready;

			const N = 50;
			const writes: Promise<{ key: string; status: number; body: string }>[] =
				[];
			for (let i = 0; i < N; i++) {
				const keyA = `worker-a-${i}`;
				const keyB = `worker-b-${i}`;
				writes.push(
					a
						.dispatchFetch(`http://x/kv?key=${keyA}&source=a`, {
							method: "PUT",
							body: "v",
						})
						.then(async (response) => ({
							key: keyA,
							status: response.status,
							body: await response.text(),
						}))
				);
				writes.push(
					b
						.dispatchFetch(`http://x/kv?key=${keyB}&source=b`, {
							method: "PUT",
							body: "v",
						})
						.then(async (response) => ({
							key: keyB,
							status: response.status,
							body: await response.text(),
						}))
				);
			}

			const results = await Promise.all(writes);
			expect(results.filter((result) => result.status !== 200)).toEqual([]);

			for (const { key } of results) {
				const result = (await (
					await b.dispatchFetch(`http://x/kv?key=${key}`)
				).json()) as { value: string | null };
				expect(result.value).toBe("v");
			}
		});

		const DO_WRITES_STORAGE_SCRIPT = `
			export class StorageWriter {
				constructor(state, env) {
					this.env = env;
				}

				async fetch(request) {
					const url = new URL(request.url);
					const key = url.searchParams.get("key") ?? "from-do";

					if (url.pathname === "/do/kv") {
						if (request.method === "PUT") {
							await this.env.KV.put(key, await request.text());
							return new Response("ok");
						}
						return new Response((await this.env.KV.get(key)) ?? "<null>");
					}

					if (url.pathname === "/do/r2") {
						if (request.method === "PUT") {
							await this.env.R2.put(key, await request.text());
							return new Response("ok");
						}
						const object = await this.env.R2.get(key);
						return new Response(object === null ? "<null>" : await object.text());
					}

					if (url.pathname === "/do/d1/init") {
						await this.env.DB.exec("CREATE TABLE IF NOT EXISTS do_items (id INTEGER PRIMARY KEY, name TEXT)");
						return new Response("ok");
					}
					if (url.pathname === "/do/d1/insert") {
						await this.env.DB.prepare("INSERT INTO do_items (name) VALUES (?)")
							.bind(url.searchParams.get("name"))
							.run();
						return new Response("ok");
					}
					if (url.pathname === "/do/d1") {
						return Response.json(await this.env.DB.prepare("SELECT name FROM do_items ORDER BY name").all());
					}

					if (request.method === "PUT") {
						await this.env.KV.put(key, await request.text());
						return new Response("ok");
					}
					return new Response((await this.env.KV.get(key)) ?? "<null>");
				}
			}

			export default {
				async fetch(request, env) {
					const url = new URL(request.url);
					if (url.pathname.startsWith("/do")) {
						const id = env.WRITER.idFromName("writer");
						return env.WRITER.get(id).fetch(request);
					}
					if (url.pathname === "/r2") {
						const object = await env.R2.get(url.searchParams.get("key") ?? "from-do");
						return new Response(object === null ? "<null>" : await object.text());
					}
					if (url.pathname === "/d1") {
						return Response.json(await env.DB.prepare("SELECT name FROM do_items ORDER BY name").all());
					}
					const key = url.searchParams.get("key") ?? "from-do";
					return new Response((await env.KV.get(key)) ?? "<null>");
				}
			};
		`;

		test("Durable Object code can write shared KV, R2 and D1 read by another instance", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = make({
				root,
				name: "a",
				kvId: "ns",
				r2Bucket: "bucket",
				d1Id: "db",
				script: DO_WRITES_STORAGE_SCRIPT,
				durableObjects: { WRITER: "StorageWriter" },
			});
			const b = make({
				root,
				name: "b",
				kvId: "ns",
				r2Bucket: "bucket",
				d1Id: "db",
				script: DO_WRITES_STORAGE_SCRIPT,
				durableObjects: { WRITER: "StorageWriter" },
			});
			await a.ready;
			await b.ready;

			await (
				await a.dispatchFetch("http://x/do/kv?key=from-do", {
					method: "PUT",
					body: "written-by-do",
				})
			).text();

			expect(
				await (await b.dispatchFetch("http://x/?key=from-do")).text()
			).toBe("written-by-do");
			expect(
				await (await b.dispatchFetch("http://x/do/kv?key=from-do")).text()
			).toBe("written-by-do");

			await (
				await a.dispatchFetch("http://x/do/r2?key=from-do", {
					method: "PUT",
					body: "r2-written-by-do",
				})
			).text();
			expect(
				await (await b.dispatchFetch("http://x/r2?key=from-do")).text()
			).toBe("r2-written-by-do");

			await (await a.dispatchFetch("http://x/do/d1/init")).text();
			await (await a.dispatchFetch("http://x/do/d1/insert?name=do-a")).text();
			const d1Result = (await (
				await b.dispatchFetch("http://x/d1")
			).json()) as { results: { name: string }[] };
			expect(d1Result.results).toEqual([{ name: "do-a" }]);
		});

		// Same regression as above, but through a user Durable Object writing to a
		// shared KV binding. This exercises user code -> DO -> binding -> simulator
		// instead of direct Worker -> binding -> simulator calls.
		test("Durable Object handlers can concurrently write shared KV without failed responses", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = make({
				root,
				name: "a",
				kvId: "ns",
				script: DO_WRITES_STORAGE_SCRIPT,
				durableObjects: { WRITER: "StorageWriter" },
			});
			const b = make({
				root,
				name: "b",
				kvId: "ns",
				script: DO_WRITES_STORAGE_SCRIPT,
				durableObjects: { WRITER: "StorageWriter" },
			});
			await a.ready;
			await b.ready;

			const N = 50;
			const writes: Promise<{ key: string; status: number; body: string }>[] =
				[];
			for (let i = 0; i < N; i++) {
				const keyA = `do-a-${i}`;
				const keyB = `do-b-${i}`;
				writes.push(
					a
						.dispatchFetch(`http://x/do/kv?key=${keyA}`, {
							method: "PUT",
							body: "v",
						})
						.then(async (response) => ({
							key: keyA,
							status: response.status,
							body: await response.text(),
						}))
				);
				writes.push(
					b
						.dispatchFetch(`http://x/do/kv?key=${keyB}`, {
							method: "PUT",
							body: "v",
						})
						.then(async (response) => ({
							key: keyB,
							status: response.status,
							body: await response.text(),
						}))
				);
			}

			const results = await Promise.all(writes);
			expect(results.filter((result) => result.status !== 200)).toEqual([]);

			for (const { key } of results) {
				expect(
					await (await b.dispatchFetch(`http://x/?key=${key}`)).text()
				).toBe("v");
			}
		});
	});

	// ------------------------------------------- Worker-driven storage edge cases
	// These exercise reads and writes performed entirely *inside* Worker code (via
	// the `env.KV` / `env.R2` / `env.DB` bindings and the `caches` API), rather
	// than through Miniflare's host-side helper APIs. This goes through the real
	// runtime binding -> simulator -> shared SQLite path. All operations are
	// sequenced (A completes before B reads) so they characterise cross-process
	// visibility, not concurrency (which is covered separately above).
	describe("worker-driven storage edge cases", () => {
		const EDGE_WORKER_SCRIPT = `
			export default {
				async fetch(request, env) {
					const url = new URL(request.url);
					const p = url.pathname;
					const q = url.searchParams;
					const key = q.get("key") ?? "key";

					// -------------------------------------------------------- KV
					if (p === "/kv/put") {
						const opts = {};
						const meta = q.get("meta");
						if (meta) opts.metadata = JSON.parse(meta);
						const ttl = q.get("ttl");
						if (ttl) opts.expirationTtl = Number(ttl);
						await env.KV.put(key, await request.text(), opts);
						return new Response("ok");
					}
					if (p === "/kv/get") {
						const res = await env.KV.getWithMetadata(key);
						return Response.json({ value: res.value, metadata: res.metadata });
					}
					if (p === "/kv/delete") {
						await env.KV.delete(key);
						return new Response("ok");
					}
					if (p === "/kv/list") {
						const res = await env.KV.list({ prefix: q.get("prefix") ?? undefined });
						return Response.json({ keys: res.keys.map((k) => k.name).sort() });
					}
					if (p === "/kv/ryow") {
						// Read-your-writes within a single request.
						await env.KV.put(key, await request.text());
						return new Response((await env.KV.get(key)) ?? "<null>");
					}

					// -------------------------------------------------------- R2
					if (p === "/r2/put") {
						await env.R2.put(key, await request.text(), {
							httpMetadata: { contentType: q.get("ct") ?? "text/plain" },
							customMetadata: { src: q.get("src") ?? "x" },
						});
						return new Response("ok");
					}
					if (p === "/r2/get") {
						const obj = await env.R2.get(key);
						if (obj === null) return Response.json(null);
						return Response.json({
							value: await obj.text(),
							size: obj.size,
							contentType: obj.httpMetadata?.contentType ?? null,
							customMetadata: obj.customMetadata ?? null,
						});
					}
					if (p === "/r2/delete") {
						await env.R2.delete(key);
						return new Response("ok");
					}
					if (p === "/r2/list") {
						const res = await env.R2.list({ prefix: q.get("prefix") ?? undefined });
						return Response.json({ keys: res.objects.map((o) => o.key).sort() });
					}

					// -------------------------------------------------------- D1
					if (p === "/d1/exec") {
						await env.DB.exec(await request.text());
						return new Response("ok");
					}
					if (p === "/d1/insert") {
						await env.DB.prepare("INSERT INTO edge (name, src) VALUES (?, ?)")
							.bind(q.get("name"), q.get("src") ?? "x")
							.run();
						return new Response("ok");
					}
					if (p === "/d1/batch") {
						const names = (q.get("names") ?? "").split(",").filter(Boolean);
						await env.DB.batch(
							names.map((n) =>
								env.DB.prepare("INSERT INTO edge (name, src) VALUES (?, ?)").bind(n, q.get("src") ?? "x")
							)
						);
						return new Response("ok");
					}
					if (p === "/d1/all") {
						const { results } = await env.DB.prepare(
							"SELECT name, src FROM edge ORDER BY name"
						).all();
						return Response.json(results);
					}
					if (p === "/d1/count") {
						const row = await env.DB.prepare("SELECT COUNT(*) AS c FROM edge").first();
						return Response.json({ c: row.c });
					}

					// ----------------------------------------------------- Cache
					if (p === "/cache/put") {
						const cache = q.get("name") ? await caches.open(q.get("name")) : caches.default;
						await cache.put(
							q.get("url"),
							new Response(await request.text(), {
								headers: { "Cache-Control": "max-age=3600" },
							})
						);
						return new Response("ok");
					}
					if (p === "/cache/get") {
						const cache = q.get("name") ? await caches.open(q.get("name")) : caches.default;
						const res = await cache.match(q.get("url"));
						return new Response(res === undefined ? "<null>" : await res.text());
					}
					if (p === "/cache/delete") {
						const cache = q.get("name") ? await caches.open(q.get("name")) : caches.default;
						return new Response(String(await cache.delete(q.get("url"))));
					}

					// ----- Mixed: multiple binding types in a single request -----
					if (p === "/mixed/write") {
						const tag = q.get("tag") ?? "t";
						await env.KV.put("mixed:" + tag, "kv-" + tag);
						await env.R2.put("mixed:" + tag, "r2-" + tag);
						await env.DB.prepare("INSERT INTO edge (name, src) VALUES (?, ?)")
							.bind("mixed:" + tag, "mixed")
							.run();
						return new Response("ok");
					}
					if (p === "/mixed/read") {
						const tag = q.get("tag") ?? "t";
						const kv = await env.KV.get("mixed:" + tag);
						const r2obj = await env.R2.get("mixed:" + tag);
						const r2 = r2obj === null ? null : await r2obj.text();
						const row = await env.DB.prepare("SELECT name FROM edge WHERE name = ?")
							.bind("mixed:" + tag)
							.first();
						return Response.json({ kv, r2, d1: row ? row.name : null });
					}

					return new Response("not found", { status: 404 });
				}
			};
		`;

		function makeEdge(root: string, name: string) {
			return make({
				root,
				name,
				kvId: "ns",
				r2Bucket: "bucket",
				d1Id: "db",
				script: EDGE_WORKER_SCRIPT,
			});
		}

		async function text(mf: Miniflare, path: string, body?: string) {
			const res = await mf.dispatchFetch(`http://x${path}`, {
				method: body === undefined ? "GET" : "PUT",
				body,
			});
			return res.text();
		}

		async function json<T>(
			mf: Miniflare,
			path: string,
			body?: string
		): Promise<T> {
			const res = await mf.dispatchFetch(`http://x${path}`, {
				method: body === undefined ? "GET" : "PUT",
				body,
			});
			return (await res.json()) as T;
		}

		// ----------------------------------------------------------------- KV
		test("KV: worker write in B is read by worker in A", async ({ expect }) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			await text(b, "/kv/put?key=k", "from-b-worker");
			const got = await json<{ value: string | null }>(a, "/kv/get?key=k");
			expect(got.value).toBe("from-b-worker");
		});

		test("KV: worker overwrite in A is observed by worker in B", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			await text(a, "/kv/put?key=k", "v1");
			expect(
				(await json<{ value: string | null }>(b, "/kv/get?key=k")).value
			).toBe("v1");
			await text(a, "/kv/put?key=k", "v2");
			expect(
				(await json<{ value: string | null }>(b, "/kv/get?key=k")).value
			).toBe("v2");
		});

		test("KV: worker delete in B is observed by worker in A", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			await text(a, "/kv/put?key=k", "v");
			expect(
				(await json<{ value: string | null }>(b, "/kv/get?key=k")).value
			).toBe("v");
			await text(b, "/kv/delete?key=k");
			expect(
				(await json<{ value: string | null }>(a, "/kv/get?key=k")).value
			).toBe(null);
		});

		test("KV: worker-written metadata is read by worker in other instance", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			await text(
				a,
				`/kv/put?key=k&meta=${encodeURIComponent('{"hello":"world"}')}`,
				"v"
			);
			const got = await json<{ value: string | null; metadata: unknown }>(
				b,
				"/kv/get?key=k"
			);
			expect(got.value).toBe("v");
			expect(got.metadata).toEqual({ hello: "world" });
		});

		test("KV: worker list reflects keys written by workers in both instances", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			await text(a, "/kv/put?key=edge:a", "1");
			await text(b, "/kv/put?key=edge:b", "2");
			const listed = await json<{ keys: string[] }>(b, "/kv/list?prefix=edge:");
			expect(listed.keys).toEqual(["edge:a", "edge:b"]);
		});

		test("KV: read-your-writes within a single worker request, then visible cross-instance", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			// The same request both writes and reads back the value.
			expect(await text(a, "/kv/ryow?key=k", "self-read")).toBe("self-read");
			// And it is durable for another process.
			expect(
				(await json<{ value: string | null }>(b, "/kv/get?key=k")).value
			).toBe("self-read");
		});

		test("KV: worker write with expirationTtl is immediately visible cross-instance", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			await text(a, "/kv/put?key=k&ttl=3600", "ttl-value");
			expect(
				(await json<{ value: string | null }>(b, "/kv/get?key=k")).value
			).toBe("ttl-value");
		});

		// ----------------------------------------------------------------- R2
		test("R2: worker write in A (httpMetadata + customMetadata) read by worker in B", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			await text(a, "/r2/put?key=obj&ct=application/json&src=a", '{"x":1}');
			const got = await json<{
				value: string;
				contentType: string | null;
				customMetadata: Record<string, string> | null;
			}>(b, "/r2/get?key=obj");
			expect(got.value).toBe('{"x":1}');
			expect(got.contentType).toBe("application/json");
			expect(got.customMetadata).toEqual({ src: "a" });
		});

		test("R2: worker write of a large body (blob store) read by worker in B", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			const big = "z".repeat(2 * 1024 * 1024); // 2 MiB
			await text(a, "/r2/put?key=big", big);
			const got = await json<{ value: string; size: number }>(
				b,
				"/r2/get?key=big"
			);
			expect(got.size).toBe(big.length);
			expect(got.value.length).toBe(big.length);
		});

		test("R2: worker delete in B is observed by worker in A", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			await text(a, "/r2/put?key=obj", "data");
			expect(
				(await json<{ value: string } | null>(b, "/r2/get?key=obj"))?.value
			).toBe("data");
			await text(b, "/r2/delete?key=obj");
			expect(await json<unknown>(a, "/r2/get?key=obj")).toBe(null);
		});

		test("R2: worker list reflects objects written by workers in both instances", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			await text(a, "/r2/put?key=p/a", "1");
			await text(b, "/r2/put?key=p/b", "2");
			const listed = await json<{ keys: string[] }>(a, "/r2/list?prefix=p/");
			expect(listed.keys).toEqual(["p/a", "p/b"]);
		});

		// ----------------------------------------------------------------- D1
		test("D1: schema + rows created by worker in A are queried by worker in B", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			await text(
				a,
				"/d1/exec",
				"CREATE TABLE IF NOT EXISTS edge (id INTEGER PRIMARY KEY, name TEXT, src TEXT)"
			);
			await text(a, "/d1/insert?name=row-a&src=a");
			const rows = await json<{ name: string; src: string }[]>(b, "/d1/all");
			expect(rows).toEqual([{ name: "row-a", src: "a" }]);
		});

		test("D1: worker batch insert in A is visible to worker in B", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			await text(
				a,
				"/d1/exec",
				"CREATE TABLE IF NOT EXISTS edge (id INTEGER PRIMARY KEY, name TEXT, src TEXT)"
			);
			await text(a, "/d1/batch?names=b1,b2,b3&src=a");
			expect((await json<{ c: number }>(b, "/d1/count")).c).toBe(3);
		});

		test("D1: rows inserted by workers in both instances are all visible", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			await text(
				a,
				"/d1/exec",
				"CREATE TABLE IF NOT EXISTS edge (id INTEGER PRIMARY KEY, name TEXT, src TEXT)"
			);
			await text(a, "/d1/insert?name=from-a&src=a");
			await text(b, "/d1/insert?name=from-b&src=b");
			const rows = await json<{ name: string; src: string }[]>(a, "/d1/all");
			expect(rows.map((r) => r.name)).toEqual(["from-a", "from-b"]);
		});

		// -------------------------------------------------------------- Cache
		test("Cache: named cache populated by worker in A is matched by worker in B", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			const cacheUrl = "http://example.com/edge-named";
			await text(
				a,
				`/cache/put?name=edge&url=${encodeURIComponent(cacheUrl)}`,
				"named!"
			);
			// Cache is per-instance under the storage owner: B has its own local
			// cache and does not observe A's write.
			expect(
				await text(
					b,
					`/cache/get?name=edge&url=${encodeURIComponent(cacheUrl)}`
				)
			).toBe(sharedOwner ? "<null>" : "named!");
		});

		test("Cache: worker delete in B is observed by worker in A", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			const cacheUrl = "http://example.com/edge-delete";
			await text(a, `/cache/put?url=${encodeURIComponent(cacheUrl)}`, "cached");
			if (sharedOwner) {
				// Per-instance cache: B never sees A's write, so there is nothing for
				// B to delete on A's behalf. Just assert the isolation.
				expect(
					await text(b, `/cache/get?url=${encodeURIComponent(cacheUrl)}`)
				).toBe("<null>");
				return;
			}
			expect(
				await text(b, `/cache/get?url=${encodeURIComponent(cacheUrl)}`)
			).toBe("cached");
			expect(
				await text(b, `/cache/delete?url=${encodeURIComponent(cacheUrl)}`)
			).toBe("true");
			expect(
				await text(a, `/cache/get?url=${encodeURIComponent(cacheUrl)}`)
			).toBe("<null>");
		});

		// ------------------------------------------------- Mixed / cross-type
		test("Mixed: worker in A writes KV + R2 + D1 in one request, worker in B reads all", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			await text(
				a,
				"/d1/exec",
				"CREATE TABLE IF NOT EXISTS edge (id INTEGER PRIMARY KEY, name TEXT, src TEXT)"
			);
			await text(a, "/mixed/write?tag=one");
			const got = await json<{
				kv: string | null;
				r2: string | null;
				d1: string | null;
			}>(b, "/mixed/read?tag=one");
			expect(got).toEqual({
				kv: "kv-one",
				r2: "r2-one",
				d1: "mixed:one",
			});
		});

		test("Mixed: the same key name in KV and R2 stays type-isolated across instances", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeEdge(root, "a");
			const b = makeEdge(root, "b");
			await a.ready;
			await b.ready;

			// Write only to KV under a shared key name in A.
			await text(a, "/kv/put?key=shared-name", "kv-only");
			// B sees it in KV...
			expect(
				(await json<{ value: string | null }>(b, "/kv/get?key=shared-name"))
					.value
			).toBe("kv-only");
			// ...but the same name in R2 is independent and absent.
			expect(await json<unknown>(b, "/r2/get?key=shared-name")).toBe(null);
		});
	});

	// ----------------------------------- Worker-driven concurrency & stress tests
	// Weirder edge cases and stress tests, all driven through Worker code (the real
	// binding -> simulator -> shared SQLite path). These exercise genuine
	// cross-process contention, and several assert correctness properties that
	// only hold with proper SQLite WAL + busy-handling. They REQUIRE the workerd
	// fixes for shared local-disk SQLite, so run them with a patched binary via
	// MINIFLARE_WORKERD_PATH until those land in the pinned workerd.
	describe("worker-driven concurrency & stress", () => {
		const STRESS_WORKER_SCRIPT = `
			export default {
				async fetch(request, env) {
					const url = new URL(request.url);
					const p = url.pathname;
					const q = url.searchParams;

					// ---------------------------------------------------- KV
					if (p === "/kv/put") {
						await env.KV.put(q.get("key"), await request.text());
						return new Response("ok");
					}
					if (p === "/kv/get") {
						const v = await env.KV.get(q.get("key"));
						return new Response(v === null ? "<null>" : v);
					}
					if (p === "/kv/delete") {
						await env.KV.delete(q.get("key"));
						return new Response("ok");
					}
					if (p === "/kv/append") {
						// Deliberately non-atomic read-modify-write: demonstrates that
						// lost updates are possible across processes without transactions.
						const cur = (await env.KV.get(q.get("key"))) ?? "";
						await env.KV.put(q.get("key"), cur + q.get("c"));
						return new Response("ok");
					}
					if (p === "/kv/bulkput") {
						const n = Number(q.get("n"));
						const prefix = q.get("prefix");
						for (let i = 0; i < n; i++) {
							await env.KV.put(prefix + String(i).padStart(5, "0"), "v");
						}
						return new Response("ok");
					}
					if (p === "/kv/listcount") {
						const prefix = q.get("prefix") ?? undefined;
						let cursor = undefined;
						const names = new Set();
						for (;;) {
							const res = await env.KV.list({ prefix, cursor, limit: 1000 });
							for (const k of res.keys) names.add(k.name);
							if (res.list_complete) break;
							cursor = res.cursor;
						}
						return Response.json({ count: names.size });
					}
					if (p === "/kv/putbin") {
						const len = Number(q.get("len"));
						const bytes = new Uint8Array(len);
						for (let i = 0; i < len; i++) bytes[i] = i % 256;
						await env.KV.put(q.get("key"), bytes);
						return new Response("ok");
					}
					if (p === "/kv/getbin") {
						const buf = await env.KV.get(q.get("key"), "arrayBuffer");
						if (buf === null) return Response.json({ len: -1, ok: false });
						const bytes = new Uint8Array(buf);
						let ok = true;
						for (let i = 0; i < bytes.length; i++) {
							if (bytes[i] !== i % 256) {
								ok = false;
								break;
							}
						}
						return Response.json({ len: bytes.length, ok });
					}

					// ---------------------------------------------------- D1
					if (p === "/d1/exec") {
						await env.DB.exec(await request.text());
						return new Response("ok");
					}
					if (p === "/d1/incr") {
						// Atomic, single-statement increment: must never lose updates,
						// even under cross-process concurrency.
						await env.DB.prepare(
							"INSERT INTO counter (id, v) VALUES (?, 1) ON CONFLICT(id) DO UPDATE SET v = v + 1"
						)
							.bind(q.get("key"))
							.run();
						return new Response("ok");
					}
					if (p === "/d1/value") {
						const row = await env.DB.prepare("SELECT v FROM counter WHERE id = ?")
							.bind(q.get("key"))
							.first();
						return Response.json({ v: row ? row.v : null });
					}
					if (p === "/d1/insert") {
						await env.DB.prepare("INSERT INTO log (src) VALUES (?)")
							.bind(q.get("src"))
							.run();
						return new Response("ok");
					}
					if (p === "/d1/bulkinsert") {
						const n = Number(q.get("n"));
						const stmt = env.DB.prepare("INSERT INTO log (src) VALUES (?)");
						const batch = [];
						for (let i = 0; i < n; i++) batch.push(stmt.bind(q.get("src")));
						await env.DB.batch(batch);
						return new Response("ok");
					}
					if (p === "/d1/stats") {
						const c = await env.DB.prepare("SELECT COUNT(*) AS c FROM log").first();
						const d = await env.DB.prepare(
							"SELECT COUNT(DISTINCT id) AS d FROM log"
						).first();
						const m = await env.DB.prepare("SELECT MAX(id) AS m FROM log").first();
						return Response.json({ count: c.c, distinctIds: d.d, maxId: m.m });
					}

					// ---------------------------------------------------- R2
					if (p === "/r2/put") {
						await env.R2.put(q.get("key"), await request.text());
						return new Response("ok");
					}
					if (p === "/r2/get") {
						const o = await env.R2.get(q.get("key"));
						return new Response(o === null ? "<null>" : await o.text());
					}
					if (p === "/r2/putbig") {
						await env.R2.put(q.get("key"), "x".repeat(Number(q.get("len"))));
						return new Response("ok");
					}
					if (p === "/r2/size") {
						const o = await env.R2.get(q.get("key"));
						return Response.json({ size: o === null ? -1 : o.size });
					}

					// ---------------------------------------------------- Cache
					if (p === "/cache/put") {
						await caches.default.put(
							q.get("url"),
							new Response(await request.text(), {
								headers: { "Cache-Control": "max-age=3600" },
							})
						);
						return new Response("ok");
					}
					if (p === "/cache/get") {
						const res = await caches.default.match(q.get("url"));
						return new Response(res === undefined ? "<null>" : await res.text());
					}

					// ------------- Touch every binding type in one request -------------
					if (p === "/touchall") {
						const tag = q.get("tag");
						await env.DB.exec(
							"CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, src TEXT)"
						);
						await env.KV.put("touch:" + tag, "v");
						await env.R2.put("touch:" + tag, "v");
						await env.DB.prepare("INSERT INTO log (src) VALUES (?)").bind(tag).run();
						await caches.default.put(
							"http://x/touch/" + tag,
							new Response("v", { headers: { "Cache-Control": "max-age=3600" } })
						);
						return new Response("ok");
					}

					// ------------- D1: tagged big batch + tagged count -------------
					if (p === "/d1/bigbatch") {
						const n = Number(q.get("n"));
						const stmt = env.DB.prepare("INSERT INTO log (src) VALUES (?)");
						const batch = [];
						for (let i = 0; i < n; i++) batch.push(stmt.bind(q.get("tag")));
						await env.DB.batch(batch);
						return new Response("ok");
					}
					if (p === "/d1/counttag") {
						const row = await env.DB.prepare(
							"SELECT COUNT(*) AS c FROM log WHERE src = ?"
						)
							.bind(q.get("tag"))
							.first();
						return Response.json({ c: row.c });
					}

					// ------------- D1: bank-transfer conservation invariant -------------
					if (p === "/bank/init") {
						await env.DB.exec(
							"CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, balance INTEGER)"
						);
						await env.DB.prepare(
							"INSERT OR IGNORE INTO accounts (id, balance) VALUES ('x', 1000), ('y', 1000)"
						).run();
						return new Response("ok");
					}
					if (p === "/bank/transfer") {
						const amt = Number(q.get("amt"));
						// A single atomic batch (transaction): debit one, credit the other.
						await env.DB.batch([
							env.DB.prepare("UPDATE accounts SET balance = balance - ? WHERE id = ?").bind(
								amt,
								q.get("from")
							),
							env.DB.prepare("UPDATE accounts SET balance = balance + ? WHERE id = ?").bind(
								amt,
								q.get("to")
							),
						]);
						return new Response("ok");
					}
					if (p === "/bank/total") {
						const row = await env.DB.prepare("SELECT SUM(balance) AS s FROM accounts").first();
						return Response.json({ total: row.s });
					}

					return new Response("not found", { status: 404 });
				}
			};
		`;

		function makeStress(root: string, name: string) {
			return make({
				root,
				name,
				kvId: "ns",
				r2Bucket: "bucket",
				d1Id: "db",
				script: STRESS_WORKER_SCRIPT,
			});
		}

		async function fire(
			mf: Miniflare,
			path: string,
			body?: string
		): Promise<number> {
			const res = await mf.dispatchFetch(`http://x${path}`, {
				method: body === undefined ? "GET" : "PUT",
				body,
			});
			await res.text();
			return res.status;
		}

		async function bodyOf(mf: Miniflare, path: string): Promise<string> {
			return (await mf.dispatchFetch(`http://x${path}`)).text();
		}

		async function jsonOf<T>(mf: Miniflare, path: string): Promise<T> {
			return (await (await mf.dispatchFetch(`http://x${path}`)).json()) as T;
		}

		test("stress: four instances concurrently write distinct KV keys via workers", async ({
			expect,
		}) => {
			const root = await useTmp();
			const names = ["a", "b", "c", "d"];
			const mfs = names.map((n) => makeStress(root, n));
			await Promise.all(mfs.map((mf) => mf.ready));

			const PER = 25;
			const statuses = await Promise.all(
				mfs.flatMap((mf, idx) =>
					Array.from({ length: PER }, (_unused, i) =>
						fire(mf, `/kv/put?key=k-${idx}-${i}`, "v")
					)
				)
			);
			expect(statuses.filter((s) => s !== 200)).toEqual([]);

			// A fresh reader sees every key written by all four instances.
			const reader = makeStress(root, "reader");
			await reader.ready;
			const misses: string[] = [];
			for (let idx = 0; idx < names.length; idx++) {
				for (let i = 0; i < PER; i++) {
					const key = `k-${idx}-${i}`;
					if ((await bodyOf(reader, `/kv/get?key=${key}`)) !== "v") {
						misses.push(key);
					}
				}
			}
			expect(misses).toEqual([]);
		});

		test("stress: concurrent writes to the SAME KV key never error and converge", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;

			const N = 50;
			const ops: Promise<number>[] = [];
			const candidates = new Set<string>();
			for (let i = 0; i < N; i++) {
				const va = `a-${i}`;
				const vb = `b-${i}`;
				candidates.add(va);
				candidates.add(vb);
				ops.push(fire(a, "/kv/put?key=hot", va));
				ops.push(fire(b, "/kv/put?key=hot", vb));
			}
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			// After writes settle, both processes read the SAME, valid final value.
			const fromA = await bodyOf(a, "/kv/get?key=hot");
			const fromB = await bodyOf(b, "/kv/get?key=hot");
			expect(fromA).toBe(fromB);
			expect(candidates.has(fromA)).toBe(true);
		});

		test("correctness: concurrent atomic D1 increments across instances lose no updates", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;
			await fire(
				a,
				"/d1/exec",
				"CREATE TABLE IF NOT EXISTS counter (id TEXT PRIMARY KEY, v INTEGER)"
			);

			const PER = 50;
			const ops: Promise<number>[] = [];
			for (let i = 0; i < PER; i++) {
				ops.push(fire(a, "/d1/incr?key=hot"));
				ops.push(fire(b, "/d1/incr?key=hot"));
			}
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			// Each increment is a single atomic statement, so no updates are lost
			// even though two processes raced -- the total must be exact.
			expect((await jsonOf<{ v: number }>(a, "/d1/value?key=hot")).v).toBe(
				PER * 2
			);
			expect((await jsonOf<{ v: number }>(b, "/d1/value?key=hot")).v).toBe(
				PER * 2
			);
		});

		test("hazard: concurrent non-atomic KV read-modify-write may lose updates (documented)", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;

			const PER = 30;
			const ops: Promise<number>[] = [];
			for (let i = 0; i < PER; i++) {
				ops.push(fire(a, "/kv/append?key=acc&c=a"));
				ops.push(fire(b, "/kv/append?key=acc&c=b"));
			}
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			// KV has no transactions, so read-modify-write races CAN lose updates: the
			// final string is some valid interleaving no longer than the total number
			// of appends. We only assert no corruption / no errors and a sane length.
			const finalA = await bodyOf(a, "/kv/get?key=acc");
			const finalB = await bodyOf(b, "/kv/get?key=acc");
			expect(finalA).toBe(finalB);
			expect(finalA.length).toBeGreaterThan(0);
			expect(finalA.length).toBeLessThanOrEqual(PER * 2);
			expect(/^[ab]*$/.test(finalA)).toBe(true);
		});

		test("correctness: concurrent D1 AUTOINCREMENT inserts keep unique ids and exact count", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			const c = makeStress(root, "c");
			await Promise.all([a.ready, b.ready, c.ready]);
			await fire(
				a,
				"/d1/exec",
				"CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, src TEXT)"
			);

			const PER = 30;
			const writers: [Miniflare, string][] = [
				[a, "a"],
				[b, "b"],
				[c, "c"],
			];
			const ops: Promise<number>[] = [];
			for (const [mf, src] of writers) {
				for (let i = 0; i < PER; i++) {
					ops.push(fire(mf, `/d1/insert?src=${src}`));
				}
			}
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			const total = PER * writers.length;
			const stats = await jsonOf<{
				count: number;
				distinctIds: number;
				maxId: number;
			}>(a, "/d1/stats");
			expect(stats.count).toBe(total);
			expect(stats.distinctIds).toBe(total);
			expect(stats.maxId).toBe(total);
		});

		test("edge: KV list pagination across instances returns every key (>1000)", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;

			// Each instance bulk-writes 600 keys under a shared prefix.
			expect(await fire(a, "/kv/bulkput?prefix=page:a-&n=600")).toBe(200);
			expect(await fire(b, "/kv/bulkput?prefix=page:b-&n=600")).toBe(200);

			// Listing (with cursor paging) from either instance sees all 1200.
			expect(
				(await jsonOf<{ count: number }>(a, "/kv/listcount?prefix=page:")).count
			).toBe(1200);
			expect(
				(await jsonOf<{ count: number }>(b, "/kv/listcount?prefix=page:")).count
			).toBe(1200);
		});

		test("edge: binary KV values with NUL/high bytes round-trip via workers cross-instance", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;

			expect(await fire(a, "/kv/putbin?key=bin&len=4096")).toBe(200);
			const got = await jsonOf<{ len: number; ok: boolean }>(
				b,
				"/kv/getbin?key=bin"
			);
			expect(got.len).toBe(4096);
			expect(got.ok).toBe(true);
		});

		test("edge: empty KV and R2 values round-trip (distinct from missing)", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;

			await fire(a, "/kv/put?key=empty", "");
			await fire(a, "/r2/put?key=empty", "");
			// Empty string is a real value, not <null>.
			expect(await bodyOf(b, "/kv/get?key=empty")).toBe("");
			expect(await bodyOf(b, "/r2/get?key=empty")).toBe("");
			// A genuinely-missing key is still <null>.
			expect(await bodyOf(b, "/kv/get?key=missing")).toBe("<null>");
		});

		test("edge: an instance restart mid-stream keeps and continues shared writes", async ({
			expect,
		}) => {
			const root = await useTmp();
			let a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;

			await fire(a, "/kv/put?key=k1", "from-a1");
			await fire(b, "/kv/put?key=k2", "from-b");

			// Tear down A while B keeps the shared database open, then bring up a
			// fresh A pointed at the same persistence dir (cold reopen of an
			// actively-held WAL database by a new process).
			await a.dispose();
			a = makeStress(root, "a");
			await a.ready;

			expect(await bodyOf(a, "/kv/get?key=k1")).toBe("from-a1");
			expect(await bodyOf(a, "/kv/get?key=k2")).toBe("from-b");
			await fire(a, "/kv/put?key=k3", "from-a2");
			expect(await bodyOf(b, "/kv/get?key=k3")).toBe("from-a2");
		});

		test("stress: interleaved concurrent multi-type writes from both instances", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;
			await fire(
				a,
				"/d1/exec",
				"CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, src TEXT)"
			);

			const PER = 20;
			const ops: Promise<number>[] = [];
			for (let i = 0; i < PER; i++) {
				ops.push(fire(a, `/kv/put?key=mt:a:${i}`, "v"));
				ops.push(fire(b, `/kv/put?key=mt:b:${i}`, "v"));
				ops.push(fire(a, `/r2/put?key=mt:a:${i}`, "v"));
				ops.push(fire(b, `/r2/put?key=mt:b:${i}`, "v"));
				ops.push(fire(a, "/d1/insert?src=a"));
				ops.push(fire(b, "/d1/insert?src=b"));
			}
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			expect(
				(await jsonOf<{ count: number }>(a, "/kv/listcount?prefix=mt:")).count
			).toBe(PER * 2);
			expect((await jsonOf<{ count: number }>(b, "/d1/stats")).count).toBe(
				PER * 2
			);
			expect(await bodyOf(b, `/r2/get?key=mt:a:0`)).toBe("v");
			expect(await bodyOf(a, `/r2/get?key=mt:b:0`)).toBe("v");
		});

		test("edge: rapid delete/recreate race on one KV key stays consistent", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;

			const N = 40;
			const ops: Promise<number>[] = [];
			for (let i = 0; i < N; i++) {
				ops.push(fire(a, "/kv/put?key=race", "v"));
				ops.push(fire(b, "/kv/delete?key=race"));
			}
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			// Whatever the interleaving, both processes must agree on the final state
			// and it must be either the value or absent (never corrupt).
			const fromA = await bodyOf(a, "/kv/get?key=race");
			const fromB = await bodyOf(b, "/kv/get?key=race");
			expect(fromA).toBe(fromB);
			expect(fromA === "v" || fromA === "<null>").toBe(true);
		});

		test("edge: concurrent CREATE TABLE IF NOT EXISTS from both instances at cold start", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;

			const ddl =
				"CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, src TEXT)";
			// Both processes race to create the schema on a freshly-created database.
			const created = await Promise.all([
				fire(a, "/d1/exec", ddl),
				fire(b, "/d1/exec", ddl),
			]);
			expect(created.filter((s) => s !== 200)).toEqual([]);

			await fire(a, "/d1/insert?src=a");
			await fire(b, "/d1/insert?src=b");
			expect((await jsonOf<{ count: number }>(a, "/d1/stats")).count).toBe(2);
		});

		test("stress: concurrent R2 writes to distinct keys from both instances", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;

			const PER = 40;
			const ops: Promise<number>[] = [];
			for (let i = 0; i < PER; i++) {
				ops.push(fire(a, `/r2/put?key=r2:a:${i}`, "v"));
				ops.push(fire(b, `/r2/put?key=r2:b:${i}`, "v"));
			}
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			const misses: string[] = [];
			for (let i = 0; i < PER; i++) {
				if ((await bodyOf(b, `/r2/get?key=r2:a:${i}`)) !== "v")
					misses.push(`a:${i}`);
				if ((await bodyOf(a, `/r2/get?key=r2:b:${i}`)) !== "v")
					misses.push(`b:${i}`);
			}
			expect(misses).toEqual([]);
		});

		test("stress: concurrent R2 writes to the SAME key never error and converge", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;

			const N = 40;
			const candidates = new Set<string>();
			const ops: Promise<number>[] = [];
			for (let i = 0; i < N; i++) {
				const va = `a-${i}`;
				const vb = `b-${i}`;
				candidates.add(va);
				candidates.add(vb);
				ops.push(fire(a, "/r2/put?key=hot", va));
				ops.push(fire(b, "/r2/put?key=hot", vb));
			}
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			const fromA = await bodyOf(a, "/r2/get?key=hot");
			const fromB = await bodyOf(b, "/r2/get?key=hot");
			expect(fromA).toBe(fromB);
			expect(candidates.has(fromA)).toBe(true);
		});

		test("stress: concurrent large R2 bodies (blob store) from both instances", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;

			const LEN = 256 * 1024; // 256 KiB each
			const PER = 8;
			const ops: Promise<number>[] = [];
			for (let i = 0; i < PER; i++) {
				ops.push(fire(a, `/r2/putbig?key=blob:a:${i}&len=${LEN}`));
				ops.push(fire(b, `/r2/putbig?key=blob:b:${i}&len=${LEN}`));
			}
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			for (let i = 0; i < PER; i++) {
				expect(
					(await jsonOf<{ size: number }>(b, `/r2/size?key=blob:a:${i}`)).size
				).toBe(LEN);
				expect(
					(await jsonOf<{ size: number }>(a, `/r2/size?key=blob:b:${i}`)).size
				).toBe(LEN);
			}
		});

		test("stress: concurrent Cache writes to distinct URLs from both instances", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;

			const PER = 40;
			const ops: Promise<number>[] = [];
			for (let i = 0; i < PER; i++) {
				const ua = encodeURIComponent(`http://example.com/c/a/${i}`);
				const ub = encodeURIComponent(`http://example.com/c/b/${i}`);
				ops.push(fire(a, `/cache/put?url=${ua}`, "v"));
				ops.push(fire(b, `/cache/put?url=${ub}`, "v"));
			}
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			// Per-instance cache under the storage owner: each instance reads back
			// only its own writes. Without the owner (shared persist root), cache is
			// shared, so each instance also sees the other's writes.
			const misses: string[] = [];
			for (let i = 0; i < PER; i++) {
				const ua = encodeURIComponent(`http://example.com/c/a/${i}`);
				const ub = encodeURIComponent(`http://example.com/c/b/${i}`);
				const reader = sharedOwner ? a : b;
				if ((await bodyOf(reader, `/cache/get?url=${ua}`)) !== "v")
					misses.push(`a:${i}`);
				const readerB = sharedOwner ? b : a;
				if ((await bodyOf(readerB, `/cache/get?url=${ub}`)) !== "v")
					misses.push(`b:${i}`);
			}
			expect(misses).toEqual([]);
		});

		test("stress: concurrent D1 batch transactions from both instances keep exact count", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;
			await fire(
				a,
				"/d1/exec",
				"CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, src TEXT)"
			);

			const BATCHES = 10;
			const ROWS = 10;
			const ops: Promise<number>[] = [];
			for (let i = 0; i < BATCHES; i++) {
				ops.push(fire(a, `/d1/bulkinsert?n=${ROWS}&src=a`));
				ops.push(fire(b, `/d1/bulkinsert?n=${ROWS}&src=b`));
			}
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			const total = BATCHES * ROWS * 2;
			const stats = await jsonOf<{ count: number; distinctIds: number }>(
				b,
				"/d1/stats"
			);
			expect(stats.count).toBe(total);
			expect(stats.distinctIds).toBe(total);
		});

		test("stress: D1 readers running concurrently with cross-process writers never error", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;
			await fire(
				a,
				"/d1/exec",
				"CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, src TEXT)"
			);

			const PER = 40;
			const writes: Promise<number>[] = [];
			const reads: Promise<number>[] = [];
			for (let i = 0; i < PER; i++) {
				writes.push(fire(a, "/d1/insert?src=a"));
				writes.push(fire(b, "/d1/insert?src=b"));
				// Reads from both processes, interleaved with the writes.
				reads.push(fire(a, "/d1/stats"));
				reads.push(fire(b, "/d1/stats"));
			}
			const [writeStatuses, readStatuses] = await Promise.all([
				Promise.all(writes),
				Promise.all(reads),
			]);
			expect(writeStatuses.filter((s) => s !== 200)).toEqual([]);
			expect(readStatuses.filter((s) => s !== 200)).toEqual([]);
			expect((await jsonOf<{ count: number }>(a, "/d1/stats")).count).toBe(
				PER * 2
			);
		});

		test("stress: cold-start race touching KV + R2 + D1 + Cache concurrently from both instances", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;

			// The very first thing both processes do is hit every binding type at
			// once -- this maximises the cold-start open/transition races across all
			// of the freshly-created databases simultaneously.
			const PER = 20;
			const ops: Promise<number>[] = [];
			for (let i = 0; i < PER; i++) {
				ops.push(fire(a, `/touchall?tag=a-${i}`));
				ops.push(fire(b, `/touchall?tag=b-${i}`));
			}
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			expect(
				(await jsonOf<{ count: number }>(b, "/kv/listcount?prefix=touch:"))
					.count
			).toBe(PER * 2);
			expect((await jsonOf<{ count: number }>(a, "/d1/stats")).count).toBe(
				PER * 2
			);
			expect(await bodyOf(b, "/r2/get?key=touch:a-0")).toBe("v");
			// Cache is per-instance under the storage owner, so A reads back its own
			// cached tag rather than B's. Without the owner the cache is shared.
			const cacheTag = sharedOwner ? "a-0" : "b-0";
			expect(
				await bodyOf(
					a,
					`/cache/get?url=${encodeURIComponent("http://x/touch/" + cacheTag)}`
				)
			).toBe("v");
		});

		test("stress: six instances concurrently writing the same KV namespace", async ({
			expect,
		}) => {
			const root = await useTmp();
			const names = ["a", "b", "c", "d", "e", "f"];
			const mfs = names.map((n) => makeStress(root, n));
			await Promise.all(mfs.map((mf) => mf.ready));

			const PER = 20;
			const statuses = await Promise.all(
				mfs.flatMap((mf, idx) =>
					Array.from({ length: PER }, (_unused, i) =>
						fire(mf, `/kv/put?key=six-${idx}-${i}`, "v")
					)
				)
			);
			expect(statuses.filter((s) => s !== 200)).toEqual([]);

			expect(
				(await jsonOf<{ count: number }>(mfs[0], "/kv/listcount?prefix=six-"))
					.count
			).toBe(names.length * PER);
		});

		test("stress: concurrent overlapping put/delete/get on a shared KV key space", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeStress(root, "a");
			const b = makeStress(root, "b");
			await a.ready;
			await b.ready;

			// Both processes interleave puts, deletes and gets over the same small set
			// of keys. Nothing may error and reads must always return a valid state.
			const KEYS = 8;
			const ROUNDS = 20;
			const ops: Promise<number>[] = [];
			const badReads: string[] = [];
			const readCheck = async (mf: Miniflare, key: string) => {
				const v = await bodyOf(mf, `/kv/get?key=${key}`);
				if (v !== "v" && v !== "<null>") badReads.push(v);
				return 200;
			};
			for (let r = 0; r < ROUNDS; r++) {
				for (let k = 0; k < KEYS; k++) {
					const key = `mix-${k}`;
					ops.push(fire(a, `/kv/put?key=${key}`, "v"));
					ops.push(fire(b, `/kv/delete?key=${key}`));
					ops.push(readCheck(a, key));
					ops.push(readCheck(b, key));
				}
			}
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);
			expect(badReads).toEqual([]);
		});

		// -------------------------------------------------------------------
		// High concurrency: many independent workerd processes (each Miniflare
		// instance is its own process) hammering one shared store at once. These
		// assert exact correctness, not just absence of errors.
		// -------------------------------------------------------------------

		function makeMany(root: string, count: number) {
			return Array.from({ length: count }, (_unused, i) =>
				makeStress(root, `p${i}`)
			);
		}

		test("high concurrency: 8 processes increment one D1 counter, total is exact", async ({
			expect,
		}) => {
			const root = await useTmp();
			const mfs = makeMany(root, 8);
			await Promise.all(mfs.map((mf) => mf.ready));
			await fire(
				mfs[0],
				"/d1/exec",
				"CREATE TABLE IF NOT EXISTS counter (id TEXT PRIMARY KEY, v INTEGER)"
			);

			const PER = 25;
			const ops = mfs.flatMap((mf) =>
				Array.from({ length: PER }, () => fire(mf, "/d1/incr?key=hot"))
			);
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			const total = mfs.length * PER;
			// Every process must observe the same exact total -- no lost updates.
			for (const mf of mfs) {
				expect((await jsonOf<{ v: number }>(mf, "/d1/value?key=hot")).v).toBe(
					total
				);
			}
		});

		test("high concurrency: 8 processes AUTOINCREMENT insert, ids unique and count exact", async ({
			expect,
		}) => {
			const root = await useTmp();
			const mfs = makeMany(root, 8);
			await Promise.all(mfs.map((mf) => mf.ready));
			await fire(
				mfs[0],
				"/d1/exec",
				"CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, src TEXT)"
			);

			const PER = 25;
			const ops = mfs.flatMap((mf, idx) =>
				Array.from({ length: PER }, () => fire(mf, `/d1/insert?src=p${idx}`))
			);
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			const total = mfs.length * PER;
			const stats = await jsonOf<{
				count: number;
				distinctIds: number;
				maxId: number;
			}>(mfs[3], "/d1/stats");
			expect(stats.count).toBe(total);
			expect(stats.distinctIds).toBe(total);
			expect(stats.maxId).toBe(total); // contiguous: no gaps, no reused ids
		});

		test("high concurrency: many processes increment many disjoint D1 rows, each exact", async ({
			expect,
		}) => {
			const root = await useTmp();
			const mfs = makeMany(root, 6);
			await Promise.all(mfs.map((mf) => mf.ready));
			await fire(
				mfs[0],
				"/d1/exec",
				"CREATE TABLE IF NOT EXISTS counter (id TEXT PRIMARY KEY, v INTEGER)"
			);

			const ROWS = 5;
			const PER = 10;
			// Every process increments every counter PER times -> high contention on
			// all rows simultaneously.
			const ops = mfs.flatMap((mf) =>
				Array.from({ length: ROWS * PER }, (_unused, i) =>
					fire(mf, `/d1/incr?key=c${i % ROWS}`)
				)
			);
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			const expected = mfs.length * PER;
			for (let r = 0; r < ROWS; r++) {
				expect(
					(await jsonOf<{ v: number }>(mfs[0], `/d1/value?key=c${r}`)).v
				).toBe(expected);
			}
		});

		test("high concurrency: concurrent bank transfers across processes conserve the total", async ({
			expect,
		}) => {
			const root = await useTmp();
			const mfs = makeMany(root, 6);
			await Promise.all(mfs.map((mf) => mf.ready));
			await fire(mfs[0], "/bank/init");

			const PER = 20;
			const ops = mfs.flatMap((mf, idx) =>
				Array.from({ length: PER }, (_unused, i) => {
					// Alternate direction so debits and credits interleave heavily.
					const [from, to] = (idx + i) % 2 === 0 ? ["x", "y"] : ["y", "x"];
					return fire(mf, `/bank/transfer?from=${from}&to=${to}&amt=1`);
				})
			);
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			// Each transfer is an atomic batch, so the invariant total == 2000 must
			// hold exactly regardless of interleaving across processes.
			for (const mf of mfs) {
				expect((await jsonOf<{ total: number }>(mf, "/bank/total")).total).toBe(
					2000
				);
			}
		});

		test("high concurrency: 10 processes write distinct KV keys, all present and correct", async ({
			expect,
		}) => {
			const root = await useTmp();
			const mfs = makeMany(root, 10);
			await Promise.all(mfs.map((mf) => mf.ready));

			const PER = 30;
			const ops = mfs.flatMap((mf, idx) =>
				Array.from({ length: PER }, (_unused, i) =>
					fire(mf, `/kv/put?key=hc-${idx}-${i}`, `val-${idx}-${i}`)
				)
			);
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			// A fresh reader process sees every key with the exact value written.
			const reader = makeStress(root, "reader");
			await reader.ready;
			expect(
				(await jsonOf<{ count: number }>(reader, "/kv/listcount?prefix=hc-"))
					.count
			).toBe(mfs.length * PER);
			const bad: string[] = [];
			for (let idx = 0; idx < mfs.length; idx++) {
				for (let i = 0; i < PER; i++) {
					const v = await bodyOf(reader, `/kv/get?key=hc-${idx}-${i}`);
					if (v !== `val-${idx}-${i}`) bad.push(`hc-${idx}-${i}=${v}`);
				}
			}
			expect(bad).toEqual([]);
		});

		test("high concurrency: many processes overwrite one KV key, all agree on a real final value", async ({
			expect,
		}) => {
			const root = await useTmp();
			const mfs = makeMany(root, 8);
			await Promise.all(mfs.map((mf) => mf.ready));

			const PER = 20;
			const candidates = new Set<string>();
			const ops = mfs.flatMap((mf, idx) =>
				Array.from({ length: PER }, (_unused, i) => {
					const v = `p${idx}-${i}`;
					candidates.add(v);
					return fire(mf, "/kv/put?key=hot", v);
				})
			);
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			// After settling, every process reads the identical final value and it is
			// one of the values that was actually written (no torn/garbage value).
			const finals = await Promise.all(
				mfs.map((mf) => bodyOf(mf, "/kv/get?key=hot"))
			);
			expect(new Set(finals).size).toBe(1);
			expect(candidates.has(finals[0])).toBe(true);
		});

		test("concurrency: a D1 batch is atomic to other processes (never a partial count)", async ({
			expect,
		}) => {
			const root = await useTmp();
			const writer = makeStress(root, "writer");
			const reader = makeStress(root, "reader");
			await writer.ready;
			await reader.ready;
			await fire(
				writer,
				"/d1/exec",
				"CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, src TEXT)"
			);

			const N = 300;
			// Kick off the big batch without awaiting, then poll the count from the
			// OTHER process while it runs. `finally` guarantees the loop terminates
			// even if the batch request rejects.
			let done = false;
			const batch = fire(writer, `/d1/bigbatch?tag=BIG&n=${N}`).finally(() => {
				done = true;
			});
			const observed: number[] = [];
			while (!done) {
				observed.push(
					(await jsonOf<{ c: number }>(reader, "/d1/counttag?tag=BIG")).c
				);
			}
			expect(await batch).toBe(200);
			observed.push(
				(await jsonOf<{ c: number }>(reader, "/d1/counttag?tag=BIG")).c
			);

			// Other processes may only ever see the batch as not-yet-applied (0) or
			// fully applied (N) -- never a partial, mid-transaction count.
			expect(observed.every((c) => c === 0 || c === N)).toBe(true);
			expect(observed.at(-1)).toBe(N);
		});

		test("high concurrency: 6 processes race cold-start touching all binding types", async ({
			expect,
		}) => {
			const root = await useTmp();
			const mfs = makeMany(root, 6);
			await Promise.all(mfs.map((mf) => mf.ready));

			const PER = 10;
			// First operation each process performs hits every binding type at once.
			const ops = mfs.flatMap((mf, idx) =>
				Array.from({ length: PER }, (_unused, i) =>
					fire(mf, `/touchall?tag=p${idx}-${i}`)
				)
			);
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			const total = mfs.length * PER;
			expect(
				(await jsonOf<{ count: number }>(mfs[0], "/kv/listcount?prefix=touch:"))
					.count
			).toBe(total);
			expect((await jsonOf<{ count: number }>(mfs[1], "/d1/stats")).count).toBe(
				total
			);
		});

		test("high concurrency: writers and a deleter race one key set; final state is consistent", async ({
			expect,
		}) => {
			const root = await useTmp();
			const mfs = makeMany(root, 6);
			await Promise.all(mfs.map((mf) => mf.ready));

			const KEYS = 6;
			const ROUNDS = 15;
			// Processes 0..4 write the keys; process 5 deletes them; all concurrent.
			const ops: Promise<number>[] = [];
			for (let r = 0; r < ROUNDS; r++) {
				for (let k = 0; k < KEYS; k++) {
					for (let idx = 0; idx < mfs.length - 1; idx++) {
						ops.push(fire(mfs[idx], `/kv/put?key=race-${k}`, "v"));
					}
					ops.push(fire(mfs[mfs.length - 1], `/kv/delete?key=race-${k}`));
				}
			}
			expect((await Promise.all(ops)).filter((s) => s !== 200)).toEqual([]);

			// Every process must agree on the final state of each key, and it must be
			// a valid value or absent (never corrupt).
			for (let k = 0; k < KEYS; k++) {
				const finals = await Promise.all(
					mfs.map((mf) => bodyOf(mf, `/kv/get?key=race-${k}`))
				);
				expect(new Set(finals).size).toBe(1);
				expect(finals[0] === "v" || finals[0] === "<null>").toBe(true);
			}
		});
	});

	// ------------------------------------------------------------- Cross-cutting
	describe("cross-cutting", () => {
		test("three instances share the same store", async ({ expect }) => {
			const root = await useTmp();
			const a = make({ root, name: "a", kvId: "ns" });
			const b = make({ root, name: "b", kvId: "ns" });
			const c = make({ root, name: "c", kvId: "ns" });
			await a.ready;
			await b.ready;
			await c.ready;
			const kvA = await a.getKVNamespace("KV");
			const kvC = await c.getKVNamespace("KV");

			await kvA.put("k", "v");
			expect(await kvC.get("k")).toBe("v");
			await kvC.put("k2", "v2");
			expect(await (await b.getKVNamespace("KV")).get("k2")).toBe("v2");
		});

		test("data survives one instance being disposed mid-run", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = make({ root, name: "a", kvId: "ns" });
			const b = make({ root, name: "b", kvId: "ns" });
			await a.ready;
			await b.ready;
			const kvA = await a.getKVNamespace("KV");

			await kvA.put("k", "written-by-a");
			// Dispose A; B should keep reading the same dataset uninterrupted.
			await a.dispose();

			const kvB = await b.getKVNamespace("KV");
			expect(await kvB.get("k")).toBe("written-by-a");
			await kvB.put("k2", "written-by-b");
			expect(await kvB.get("k2")).toBe("written-by-b");
		});

		test("data persists across a full restart (new instance, same root)", async ({
			expect,
		}) => {
			const root = await useTmp();
			const first = make({ root, name: "a", kvId: "ns" });
			await first.ready;
			const kv1 = await first.getKVNamespace("KV");
			await kv1.put("k", "persisted");
			await first.dispose();

			const second = make({ root, name: "a", kvId: "ns" });
			await second.ready;
			const kv2 = await second.getKVNamespace("KV");
			expect(await kv2.get("k")).toBe("persisted");
		});

		test("mixed: shared KV (same id) but isolated R2 (different bucket)", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = make({
				root,
				name: "a",
				kvId: "ns",
				r2Bucket: "bucket-a",
			});
			const b = make({
				root,
				name: "b",
				kvId: "ns",
				r2Bucket: "bucket-b",
			});
			await a.ready;
			await b.ready;

			const kvA = await a.getKVNamespace("KV");
			const kvB = await b.getKVNamespace("KV");
			const r2A = await a.getR2Bucket("R2");
			const r2B = await b.getR2Bucket("R2");

			await kvA.put("k", "shared");
			await r2A.put("obj", "isolated");

			expect(await kvB.get("k")).toBe("shared");
			expect(await r2B.head("obj")).toBe(null);
		});
	});

	// ----------------------------------------------------- Concurrency / SQLITE_BUSY
	// Concurrent cross-process writes must neither fail (no SQLITE_BUSY / read-only
	// surfacing as errors) nor corrupt the store: every committed write must remain
	// readable, and counts must stay exact.
	describe("concurrent writes", () => {
		test("KV: concurrent writes to distinct keys from both instances", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = make({ root, name: "a", kvId: "ns" });
			const b = make({ root, name: "b", kvId: "ns" });
			await a.ready;
			await b.ready;
			const kvA = await a.getKVNamespace("KV");
			const kvB = await b.getKVNamespace("KV");

			const N = 50;
			const ops: Promise<{ ok: boolean; key: string }>[] = [];
			for (let i = 0; i < N; i++) {
				const keyA = `a-${i}`;
				const keyB = `b-${i}`;
				ops.push(
					kvA
						.put(keyA, "v")
						.then(() => ({ ok: true, key: keyA }))
						.catch(() => ({ ok: false, key: keyA }))
				);
				ops.push(
					kvB
						.put(keyB, "v")
						.then(() => ({ ok: true, key: keyB }))
						.catch(() => ({ ok: false, key: keyB }))
				);
			}
			const results = await Promise.all(ops);
			expect(results.filter((r) => !r.ok)).toEqual([]);
			expect(results.some((r) => r.ok)).toBe(true);

			// Integrity: every write that reported success must be readable.
			for (const r of results.filter((r) => r.ok)) {
				expect(await kvA.get(r.key)).toBe("v");
			}
		});

		test("D1: concurrent inserts into the same table from both instances", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = make({ root, name: "a", d1Id: "db" });
			const b = make({ root, name: "b", d1Id: "db" });
			await a.ready;
			await b.ready;
			const dbA = await a.getD1Database("DB");
			const dbB = await b.getD1Database("DB");

			await dbA.exec(
				"CREATE TABLE log (id INTEGER PRIMARY KEY AUTOINCREMENT, src TEXT);"
			);

			const N = 40;
			const ops: Promise<boolean>[] = [];
			for (let i = 0; i < N; i++) {
				ops.push(
					dbA
						.prepare("INSERT INTO log (src) VALUES ('a')")
						.run()
						.then(() => true)
						.catch(() => false)
				);
				ops.push(
					dbB
						.prepare("INSERT INTO log (src) VALUES ('b')")
						.run()
						.then(() => true)
						.catch(() => false)
				);
			}
			const results = await Promise.all(ops);
			const succeeded = results.filter(Boolean).length;
			expect(succeeded).toBe(results.length);
			expect(succeeded).toBeGreaterThan(0);

			// Integrity: row count equals number of successful inserts (no
			// corruption, no phantom/lost committed rows).
			const { results: rows } = await dbA
				.prepare("SELECT COUNT(*) as c FROM log")
				.all<{ c: number }>();
			expect(rows[0].c).toBe(succeeded);
		});
	});

	// --------------------------------------------------- Durable Objects (out of scope)
	// Documents the behaviour of sharing a DO via defaultPersistRoot. DOs are out
	// of scope for the singleton feature; this test records what happens today.
	describe("Durable Objects (behaviour documentation)", () => {
		const DO_SCRIPT = `
			export class Counter {
				constructor(state) { this.state = state; }
				async fetch(request) {
					const url = new URL(request.url);
					if (request.method === "POST") {
						await this.state.storage.put("v", url.searchParams.get("v"));
						return new Response("ok");
					}
					const v = await this.state.storage.get("v");
					return new Response(String(v ?? "<null>"));
				}
			}
			export default {
				async fetch(request, env) {
					const id = env.COUNTER.idFromName("singleton");
					return env.COUNTER.get(id).fetch(request);
				}
			};
		`;

		function makeDO(root: string, name: string) {
			const mf = new Miniflare({
				name,
				defaultPersistRoot: root,
				modules: true,
				script: DO_SCRIPT,
				compatibilityDate: COMPAT_DATE,
				durableObjects: { COUNTER: "Counter" },
			});
			instances.push(mf);
			return mf;
		}

		test("DO storage is not live-shared between running instances", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeDO(root, "a");
			const b = makeDO(root, "b");
			await a.ready;
			await b.ready;

			await (
				await a.dispatchFetch("http://x/?v=42", { method: "POST" })
			).text();
			const res = await b.dispatchFetch("http://x/");
			const text = await res.text();
			// User Durable Objects are intentionally out of scope for shared local
			// binding singletons. Two running instances can have independent live
			// actors even when pointed at the same persistence directory.
			expect(text).toBe("<null>");
		});

		const DO_OUTPUT_GATE_SCRIPT = `
			export class GateCounter {
				constructor(state) { this.state = state; }

				async fetch(request) {
					const url = new URL(request.url);
					if (url.pathname === "/write-and-wait") {
						await this.state.storage.put("v", "pending");
						await new Promise((resolve) => setTimeout(resolve, 500));
						return new Response("done");
					}

					if (url.pathname === "/write-and-throw") {
						await this.state.storage.put("v", "thrown");
						throw new Error("boom");
					}

					const v = await this.state.storage.get("v");
					return new Response(String(v ?? "<null>"));
				}
			}

			export default {
				async fetch(request, env) {
					const id = env.COUNTER.idFromName("singleton");
					return env.COUNTER.get(id).fetch(request);
				}
			};
		`;

		function makeGateDO(root: string) {
			const mf = new Miniflare({
				// The default DO uniqueKey is `${name}-${className}`. Using the same
				// name in both Miniflare instances deliberately points both live
				// actors at the same persisted DO storage.
				name: "same-worker",
				defaultPersistRoot: root,
				modules: true,
				script: DO_OUTPUT_GATE_SCRIPT,
				compatibilityDate: COMPAT_DATE,
				durableObjects: { COUNTER: "GateCounter" },
			});
			instances.push(mf);
			return mf;
		}

		test("DO output gate does not block another process reading the same DO storage", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeGateDO(root);
			const b = makeGateDO(root);
			await a.ready;
			await b.ready;

			const pendingWrite = a.dispatchFetch("http://x/write-and-wait");
			const writeCompleted = await Promise.race([
				pendingWrite.then(() => true),
				new Promise<false>((resolve) => setTimeout(() => resolve(false), 100)),
			]);
			expect(writeCompleted).toBe(false);

			// Output gates block A's outgoing response while the write is flushed, but
			// they are local to A's live actor. B is a separate workerd process with a
			// separate live actor, so it can observe the shared SQLite state before A's
			// request has completed.
			expect(await (await b.dispatchFetch("http://x/read")).text()).toBe(
				"pending"
			);
			expect(await (await pendingWrite).text()).toBe("done");
		});

		test("DO storage writes are not rolled back when the request throws", async ({
			expect,
		}) => {
			const root = await useTmp();
			const a = makeGateDO(root);
			const b = makeGateDO(root);
			await a.ready;
			await b.ready;

			const failed = await a.dispatchFetch("http://x/write-and-throw");
			expect(failed.status).toBe(500);
			await failed.text();

			// Output gates are durability/visibility gates, not request-scoped
			// transactions. A write that completed before user code threw can still be
			// committed and subsequently observed by another process.
			expect(await (await b.dispatchFetch("http://x/read")).text()).toBe(
				"thrown"
			);
		});
	});

	// --------------------------------------------- Extra routed storage types
	// Streams, Secrets Store and Images also share their backing storage across
	// instances (via the owner when enabled; via the persist root otherwise).
	describe("extra storage types", () => {
		test("Stream: a video uploaded by a worker in A is listed by a worker in B", async ({
			expect,
		}) => {
			const root = await useTmp();
			const WORKER = `export default {
				async fetch(request, env) {
					if (request.method === "PUT") {
						const body = new Response(new Uint8Array([0,1,2,3,4,5,6,7])).body;
						const video = await env.STREAM.upload(body, {});
						return Response.json({ id: video.id });
					}
					const videos = await env.STREAM.videos.list();
					return Response.json({ count: videos.length });
				}
			}`;
			const a = make({ root, name: "a", stream: true, script: WORKER });
			const b = make({ root, name: "b", stream: true, script: WORKER });
			await a.ready;
			await b.ready;

			const put = (await (
				await a.dispatchFetch("http://x/", { method: "PUT" })
			).json()) as { id: string };
			expect(put.id).toBeTruthy();

			expect(
				(
					(await (await b.dispatchFetch("http://x/")).json()) as {
						count: number;
					}
				).count
			).toBe(1);
		});

		test("Secrets Store: a secret created via A is read by a worker in B", async ({
			expect,
		}) => {
			const root = await useTmp();
			const secret = { store_id: "store", secret_name: "api_key" };
			const WORKER = `export default {
				async fetch(request, env) {
					try { return new Response(await env.SECRET.get()); }
					catch (e) { return new Response(e.message, { status: 404 }); }
				}
			}`;
			const a = make({ root, name: "a", secret, script: WORKER });
			const b = make({ root, name: "b", secret, script: WORKER });
			await a.ready;
			await b.ready;

			await (
				await a.getSecretsStoreSecretAPI("SECRET")
			)().create("shared-secret");

			expect(await (await b.dispatchFetch("http://x/")).text()).toBe(
				"shared-secret"
			);
		});

		test("Images: the binding is usable in both instances", async ({
			expect,
		}) => {
			const root = await useTmp();
			const WORKER = `export default {
				async fetch(_request, env) {
					return new Response(typeof env.IMAGES.info);
				}
			}`;
			const a = make({ root, name: "a", images: true, script: WORKER });
			const b = make({ root, name: "b", images: true, script: WORKER });
			await a.ready;
			await b.ready;

			expect(await (await a.dispatchFetch("http://x/")).text()).toBe(
				"function"
			);
			expect(await (await b.dispatchFetch("http://x/")).text()).toBe(
				"function"
			);
		});
	});
});
