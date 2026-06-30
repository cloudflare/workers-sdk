import { utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
	clearStorageOwner,
	countLiveStorageClients,
	heartbeatStorageOwner,
	isProcessAlive,
	Miniflare,
	OWNER_STALE_MS,
	readStorageOwner,
	registerStorageClient,
	tryAcquireOwnerSpawnLock,
	unregisterStorageClient,
	writeStorageOwner,
	type StorageOwnerDefinition,
} from "miniflare";
import { describe, it, vi } from "vitest";
import { useTmp } from "./test-shared";

// A pid that is essentially guaranteed not to exist on the host.
const DEAD_PID = 0x7fffffff;

function makeDefinition(
	overrides: Partial<StorageOwnerDefinition> = {}
): StorageOwnerDefinition {
	return {
		pid: process.pid,
		httpAddress: "127.0.0.1:12345",
		updatedAt: Date.now(),
		...overrides,
	};
}

describe("isProcessAlive", () => {
	it("reports the current process as alive", ({ expect }) => {
		expect(isProcessAlive(process.pid)).toBe(true);
	});
	it("reports a non-existent process as dead", ({ expect }) => {
		expect(isProcessAlive(DEAD_PID)).toBe(false);
	});
	it("treats invalid pids as dead", ({ expect }) => {
		expect(isProcessAlive(0)).toBe(false);
		expect(isProcessAlive(-1)).toBe(false);
	});
});

describe("storage owner definition", () => {
	it("returns undefined when no owner is published", async ({ expect }) => {
		const persistRoot = await useTmp();
		expect(readStorageOwner(persistRoot)).toBeUndefined();
	});

	it("round-trips a published definition", async ({ expect }) => {
		const persistRoot = await useTmp();
		const def = makeDefinition();
		writeStorageOwner(persistRoot, def);
		expect(readStorageOwner(persistRoot)).toEqual(def);
	});

	it("treats a definition with a dead pid as absent", async ({ expect }) => {
		const persistRoot = await useTmp();
		writeStorageOwner(persistRoot, makeDefinition({ pid: DEAD_PID }));
		expect(readStorageOwner(persistRoot)).toBeUndefined();
	});

	it("treats a stale (un-heartbeated) definition as absent", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		writeStorageOwner(persistRoot, makeDefinition());
		// Backdate the mtime well past the staleness window.
		const old = new Date(Date.now() - OWNER_STALE_MS - 60_000);
		utimesSync(path.join(persistRoot, ".miniflare-owner.json"), old, old);
		expect(readStorageOwner(persistRoot)).toBeUndefined();
		// A heartbeat refreshes it back to live.
		heartbeatStorageOwner(persistRoot);
		expect(readStorageOwner(persistRoot)).toBeDefined();
	});

	it("ignores a partially-written definition file", async ({ expect }) => {
		const persistRoot = await useTmp();
		writeFileSync(
			path.join(persistRoot, ".miniflare-owner.json"),
			"{ not valid json"
		);
		expect(readStorageOwner(persistRoot)).toBeUndefined();
	});

	it("clearStorageOwner removes our own definition", async ({ expect }) => {
		const persistRoot = await useTmp();
		writeStorageOwner(persistRoot, makeDefinition());
		clearStorageOwner(persistRoot, process.pid);
		expect(readStorageOwner(persistRoot)).toBeUndefined();
	});

	it("clearStorageOwner does not stomp a different live owner", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		// Pretend the current process is a *different* live owner.
		writeStorageOwner(persistRoot, makeDefinition({ pid: process.pid }));
		clearStorageOwner(persistRoot, process.pid + 1);
		expect(readStorageOwner(persistRoot)).toBeDefined();
	});
});

describe("owner spawn lock", () => {
	it("grants the lock to a single acquirer", async ({ expect }) => {
		const persistRoot = await useTmp();
		const first = tryAcquireOwnerSpawnLock(persistRoot);
		expect(first).toBeDefined();
		const second = tryAcquireOwnerSpawnLock(persistRoot);
		expect(second).toBeUndefined();
		first?.release();
		const third = tryAcquireOwnerSpawnLock(persistRoot);
		expect(third).toBeDefined();
		third?.release();
	});

	it("reclaims a lock held by a dead process", async ({ expect }) => {
		const persistRoot = await useTmp();
		// Simulate a crashed holder by writing a dead pid into the lock file.
		writeFileSync(
			path.join(persistRoot, ".miniflare-owner.lock"),
			String(DEAD_PID)
		);
		const lock = tryAcquireOwnerSpawnLock(persistRoot);
		expect(lock).toBeDefined();
		lock?.release();
	});

	it("reclaims a stale lock", async ({ expect }) => {
		const persistRoot = await useTmp();
		const lockPath = path.join(persistRoot, ".miniflare-owner.lock");
		writeFileSync(lockPath, String(process.pid));
		const old = new Date(Date.now() - OWNER_STALE_MS - 60_000);
		utimesSync(lockPath, old, old);
		const lock = tryAcquireOwnerSpawnLock(persistRoot);
		expect(lock).toBeDefined();
		lock?.release();
	});
});

describe("client presence registry", () => {
	it("counts live clients and reclaims dead/stale ones", async ({ expect }) => {
		const persistRoot = await useTmp();
		expect(countLiveStorageClients(persistRoot)).toBe(0);

		const clientPath = registerStorageClient(persistRoot);
		expect(countLiveStorageClients(persistRoot)).toBe(1);

		// A dead client is reclaimed and not counted.
		const deadClient = path.join(
			persistRoot,
			".miniflare-owner-clients",
			String(DEAD_PID)
		);
		writeFileSync(deadClient, String(Date.now()));
		expect(countLiveStorageClients(persistRoot)).toBe(1);

		unregisterStorageClient(clientPath);
		expect(countLiveStorageClients(persistRoot)).toBe(0);
	});
});

describe.sequential("owner presence integration", () => {
	it("an owner-role instance publishes a live definition and clears it on dispose", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const owner = new Miniflare({
			unsafeSharedStorageOwner: true,
			unsafeStorageOwnerRole: "owner",
			defaultPersistRoot: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			kvNamespaces: ["NS"],
			script:
				"export default { async fetch() { return new Response('owner'); } }",
		});
		await owner.ready;

		const def = readStorageOwner(persistRoot);
		expect(def).toBeDefined();
		expect(def?.pid).toBe(process.pid);
		expect(def?.httpAddress).toMatch(/^127\.0\.0\.1:\d+$/);

		await owner.dispose();
		expect(readStorageOwner(persistRoot)).toBeUndefined();
	});

	it("a client-role instance registers presence and removes it on dispose", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const client = new Miniflare({
			unsafeSharedStorageOwner: true,
			unsafeStorageOwnerRole: "client",
			defaultPersistRoot: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			script:
				"export default { async fetch() { return new Response('client'); } }",
		});
		await client.ready;

		await vi.waitFor(
			() => expect(countLiveStorageClients(persistRoot)).toBe(1),
			{
				timeout: 5_000,
				interval: 100,
			}
		);

		await client.dispose();
		expect(countLiveStorageClients(persistRoot)).toBe(0);
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
		const common = {
			unsafeSharedStorageOwner: true,
			defaultPersistRoot: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			compatibilityDate: "2025-01-01",
			modules: true,
			kvNamespaces: ["NS"],
			script: KV_WORKER,
		};

		const owner = new Miniflare({ ...common, unsafeStorageOwnerRole: "owner" });
		await owner.ready;
		const client = new Miniflare({
			...common,
			unsafeStorageOwnerRole: "client",
		});

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
		const common = {
			unsafeSharedStorageOwner: true,
			defaultPersistRoot: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			compatibilityDate: "2025-01-01",
			modules: true,
			r2Buckets: ["BUCKET"],
			d1Databases: ["DB"],
			script: WORKER,
		};
		const owner = new Miniflare({ ...common, unsafeStorageOwnerRole: "owner" });
		await owner.ready;
		const client = new Miniflare({
			...common,
			unsafeStorageOwnerRole: "client",
		});

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
		// Exercises the JSRPC (capnweb) path of the owner boundary, including
		// nested RpcTargets (`videos.list()`).
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
		const common = {
			unsafeSharedStorageOwner: true,
			defaultPersistRoot: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			compatibilityDate: "2025-01-01",
			modules: true,
			stream: { binding: "STREAM" },
			script: WORKER,
		};
		const owner = new Miniflare({ ...common, unsafeStorageOwnerRole: "owner" });
		await owner.ready;
		const client = new Miniflare({
			...common,
			unsafeStorageOwnerRole: "client",
		});

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
		const common = {
			unsafeSharedStorageOwner: true,
			defaultPersistRoot: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			compatibilityDate: "2025-01-01",
			modules: true,
			secretsStoreSecrets: {
				SECRET: { store_id: "store_a", secret_name: "api_key" },
			},
			script: WORKER,
		};
		const owner = new Miniflare({ ...common, unsafeStorageOwnerRole: "owner" });
		await owner.ready;
		const client = new Miniflare({
			...common,
			unsafeStorageOwnerRole: "client",
		});

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
		const common = {
			unsafeSharedStorageOwner: true,
			defaultPersistRoot: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			compatibilityDate: "2025-01-01",
			modules: true,
			images: { binding: "IMAGES" },
			script:
				"export default { async fetch(_request, env) { return new Response(typeof env.IMAGES.info); } }",
		};
		const owner = new Miniflare({ ...common, unsafeStorageOwnerRole: "owner" });
		const client = new Miniflare({
			...common,
			unsafeStorageOwnerRole: "client",
		});
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
	});

	it("auto-spawns a detached owner, routes to it, and tears it down when idle", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		// Shrink the owner's teardown timings (inherited by the spawned process).
		const prevGrace = process.env.MINIFLARE_STORAGE_OWNER_GRACE_MS;
		const prevCheck = process.env.MINIFLARE_STORAGE_OWNER_IDLE_CHECK_MS;
		process.env.MINIFLARE_STORAGE_OWNER_GRACE_MS = "500";
		process.env.MINIFLARE_STORAGE_OWNER_IDLE_CHECK_MS = "200";

		let ownerPid: number | undefined;
		const client = new Miniflare({
			// No role set → behaves as a client and auto-spawns an owner.
			unsafeSharedStorageOwner: true,
			defaultPersistRoot: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			compatibilityDate: "2025-01-01",
			modules: true,
			kvNamespaces: ["NS"],
			script: `export default {
				async fetch(request, env) {
					if (request.method === "PUT") {
						await env.NS.put("k", await request.text());
						return new Response("ok");
					}
					return new Response((await env.NS.get("k")) ?? "<null>");
				}
			}`,
		});

		try {
			await client.ready;

			// An owner was auto-spawned and published itself.
			const def = readStorageOwner(persistRoot);
			expect(def).toBeDefined();
			ownerPid = def?.pid;
			expect(ownerPid).toBeDefined();
			expect(ownerPid).not.toBe(process.pid); // a separate process

			// Storage works through the routed proxy.
			await (
				await client.dispatchFetch("http://x/", {
					method: "PUT",
					body: "via-auto-owner",
				})
			).text();
			const got = await client.dispatchFetch("http://x/");
			expect(await got.text()).toBe("via-auto-owner");

			// Disposing the only client should let the owner self-terminate.
			await client.dispose();
			await vi.waitFor(
				() => expect(readStorageOwner(persistRoot)).toBeUndefined(),
				{ timeout: 15_000, interval: 200 }
			);
		} finally {
			await client.dispose().catch(() => {});
			// Safety net: ensure the detached owner isn't leaked if assertions failed.
			if (ownerPid !== undefined && isProcessAlive(ownerPid)) {
				try {
					process.kill(ownerPid);
				} catch {}
			}
			process.env.MINIFLARE_STORAGE_OWNER_GRACE_MS = prevGrace;
			process.env.MINIFLARE_STORAGE_OWNER_IDLE_CHECK_MS = prevCheck;
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
		const prevGrace = process.env.MINIFLARE_STORAGE_OWNER_GRACE_MS;
		const prevCheck = process.env.MINIFLARE_STORAGE_OWNER_IDLE_CHECK_MS;
		process.env.MINIFLARE_STORAGE_OWNER_GRACE_MS = "500";
		process.env.MINIFLARE_STORAGE_OWNER_IDLE_CHECK_MS = "200";

		const N = 3; // client instances
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
				unsafeSharedStorageOwner: true,
				defaultPersistRoot: persistRoot,
				unsafeDevRegistryPath: registryPath,
				compatibilityFlags: ["experimental"],
				compatibilityDate: "2025-01-01",
				modules: true,
				d1Databases: ["DB"],
				script: WORKER,
			});

		const clients = Array.from({ length: N }, make);
		let ownerPid: number | undefined;
		try {
			await Promise.all(clients.map((c) => c.ready));
			ownerPid = readStorageOwner(persistRoot)?.pid;
			expect(ownerPid).toBeDefined();

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
			if (ownerPid !== undefined && isProcessAlive(ownerPid)) {
				try {
					process.kill(ownerPid);
				} catch {}
			}
			process.env.MINIFLARE_STORAGE_OWNER_GRACE_MS = prevGrace;
			process.env.MINIFLARE_STORAGE_OWNER_IDLE_CHECK_MS = prevCheck;
		}
	});

	it("does nothing when the feature flag is off", async ({ expect }) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const mf = new Miniflare({
			defaultPersistRoot: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			script:
				"export default { async fetch() { return new Response('plain'); } }",
		});
		await mf.ready;
		expect(readStorageOwner(persistRoot)).toBeUndefined();
		expect(countLiveStorageClients(persistRoot)).toBe(0);
		await mf.dispose();
	});
});
