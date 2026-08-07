import { readFileSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
	getWorkerRegistry,
	isProcessAlive,
	Miniflare,
	OWNER_STALE_MS,
	STORAGE_OWNER_CLIENT_PRESENCE_PREFIX,
	STORAGE_OWNER_WORKER_NAME,
	tryAcquireOwnerSpawnLock,
} from "miniflare";
import { describe, it, vi } from "vitest";
import { useTmp } from "./test-shared";

// A pid that is essentially guaranteed not to exist on the host.
const DEAD_PID = 0x7fffffff;

/** The live shared-storage owner's dev registry entry, if any. */
function readOwnerEntry(registryPath: string) {
	return getWorkerRegistry(registryPath)[STORAGE_OWNER_WORKER_NAME];
}

/** Number of live shared-storage client presence entries in the registry. */
function countClientPresence(registryPath: string): number {
	return Object.keys(getWorkerRegistry(registryPath)).filter((name) =>
		name.startsWith(STORAGE_OWNER_CLIENT_PRESENCE_PREFIX)
	).length;
}

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

describe("owner spawn lock", () => {
	it("grants the lock to a single acquirer", async ({ expect }) => {
		const lockDir = await useTmp();
		const first = tryAcquireOwnerSpawnLock(lockDir);
		expect(first).toBeDefined();
		const second = tryAcquireOwnerSpawnLock(lockDir);
		expect(second).toBeUndefined();
		first?.release();
		const third = tryAcquireOwnerSpawnLock(lockDir);
		expect(third).toBeDefined();
		third?.release();
	});

	it("reclaims a lock held by a dead process", async ({ expect }) => {
		const lockDir = await useTmp();
		// Simulate a crashed holder by writing a dead pid into the lock file.
		writeFileSync(
			path.join(lockDir, ".miniflare-owner.lock"),
			String(DEAD_PID)
		);
		const lock = tryAcquireOwnerSpawnLock(lockDir);
		expect(lock).toBeDefined();
		lock?.release();
	});

	it("reclaims a stale lock", async ({ expect }) => {
		const lockDir = await useTmp();
		const lockPath = path.join(lockDir, ".miniflare-owner.lock");
		writeFileSync(lockPath, String(process.pid));
		const old = new Date(Date.now() - OWNER_STALE_MS - 60_000);
		utimesSync(lockPath, old, old);
		const lock = tryAcquireOwnerSpawnLock(lockDir);
		expect(lock).toBeDefined();
		lock?.release();
	});
});

describe.sequential("owner presence integration", () => {
	it("an owner-role instance registers itself in the dev registry and removes it on dispose", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const owner = new Miniflare({
			unsafeSharedStorageOwner: true,
			unsafeStorageOwnerRole: "owner",
			resourcePersistencePath: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			kvNamespaces: ["NS"],
			script:
				"export default { async fetch() { return new Response('owner'); } }",
		});
		await owner.ready;

		const entry = readOwnerEntry(registryPath);
		expect(entry).toBeDefined();
		expect(entry?.debugPortAddress).toMatch(/^127\.0\.0\.1:\d+$/);

		await owner.dispose();
		expect(readOwnerEntry(registryPath)).toBeUndefined();
	});

	it("a client-role instance registers a presence entry and removes it on dispose", async ({
		expect,
	}) => {
		const persistRoot = await useTmp();
		const registryPath = await useTmp();
		const common = {
			unsafeSharedStorageOwner: true,
			resourcePersistencePath: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			compatibilityDate: "2025-01-01",
			modules: true,
			kvNamespaces: ["NS"],
			script: "export default { async fetch() { return new Response('ok'); } }",
		};
		const owner = new Miniflare({ ...common, unsafeStorageOwnerRole: "owner" });
		await owner.ready;
		const client = new Miniflare({
			...common,
			unsafeStorageOwnerRole: "client",
		});

		try {
			await client.ready;

			await vi.waitFor(
				() => expect(countClientPresence(registryPath)).toBe(1),
				{
					timeout: 5_000,
					interval: 100,
				}
			);

			await client.dispose();
			expect(countClientPresence(registryPath)).toBe(0);
		} finally {
			await client.dispose().catch(() => {});
			await owner.dispose();
		}
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
			resourcePersistencePath: persistRoot,
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
			resourcePersistencePath: persistRoot,
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
		const common = {
			unsafeSharedStorageOwner: true,
			resourcePersistencePath: persistRoot,
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
			resourcePersistencePath: persistRoot,
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
			resourcePersistencePath: persistRoot,
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
			resourcePersistencePath: persistRoot,
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

			// An owner was auto-spawned and registered itself in the dev registry.
			expect(readOwnerEntry(registryPath)).toBeDefined();
			ownerPid = readOwnerPidFromLog(persistRoot);
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
				() => expect(readOwnerEntry(registryPath)).toBeUndefined(),
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
				resourcePersistencePath: persistRoot,
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
			expect(readOwnerEntry(registryPath)).toBeDefined();
			ownerPid = readOwnerPidFromLog(persistRoot);

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
			resourcePersistencePath: persistRoot,
			unsafeDevRegistryPath: registryPath,
			compatibilityFlags: ["experimental"],
			modules: true,
			script:
				"export default { async fetch() { return new Response('plain'); } }",
		});
		await mf.ready;
		expect(readOwnerEntry(registryPath)).toBeUndefined();
		expect(countClientPresence(registryPath)).toBe(0);
		await mf.dispose();
	});
});
