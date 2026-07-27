import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { removeDir } from "@cloudflare/workers-utils";
import {
	DeferredPromise,
	DURABLE_OBJECTS_PLUGIN_NAME,
	kUnsafeEphemeralUniqueKey,
	Miniflare,
} from "miniflare";
import { describe, onTestFinished, test } from "vitest";
import {
	disposeWithRetry,
	singleModuleManifest,
	useDispose,
	useTmp,
} from "../../test-shared";
import type { MessageEvent, MiniflareOptions, RequestInit } from "miniflare";

const COUNTER_SCRIPT = (responsePrefix = "") => `export class Counter {
  instanceId = crypto.randomUUID();
  constructor(state) {
    this.storage = state.storage;
  }
  async fetch(request) {
    if (request.cf?.instanceId) return new Response(this.instanceId);
    const count = ((await this.storage.get("count")) ?? 0) + 1;
    void this.storage.put("count", count);
    return new Response(${JSON.stringify(responsePrefix)} + count);
  }
}
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const OBJECT = env[request.headers.get("MF-Test-Object") ?? "COUNTER"];
    const id = OBJECT.idFromName(pathname);
    const stub = OBJECT.get(id);
    return stub.fetch(request);
  },
};`;

const STATEFUL_SCRIPT = (responsePrefix = "") => `
  export class DurableObject {
    constructor() {
      this.uuid = crypto.randomUUID();
    }
    fetch() {
      return new Response(${JSON.stringify(responsePrefix)} + this.uuid);
    }
  }
  export default {
    fetch(req, env, ctx) {
      const singleton = env.DURABLE_OBJECT.idFromName("");
      const durableObject = env.DURABLE_OBJECT.get(singleton);
      return durableObject.fetch(req);
    }
  }
`;

test("persists Durable Object data in-memory between options reloads", async ({
	expect,
}) => {
	const counterOpts = (
		responsePrefix: string,
		{ ephemeral = false }: { ephemeral?: boolean } = {}
	): MiniflareOptions => ({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(COUNTER_SCRIPT(responsePrefix)),
					env: {
						COUNTER: {
							type: "durable-object",
							workerName: "",
							exportName: "Counter",
						},
					},
					exports: {
						Counter: { type: "durable-object", storage: "sqlite" },
					},
				},
				...(ephemeral ? { dev: { unsafeEphemeralDurableObjects: true } } : {}),
			},
		],
	});

	const mf = new Miniflare(counterOpts("Options #1: "));
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #1: 1");

	await mf.setOptions(counterOpts("Options #2: "));
	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #2: 2");

	await mf.setOptions(counterOpts("Options #3: "));
	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #3: 3");

	await mf.setOptions(counterOpts("Options #4: "));
	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #4: 4");

	// Check a `new Miniflare()` instance has its own in-memory storage
	await mf.dispose();
	const mf2 = new Miniflare(counterOpts("Options #5: "));
	useDispose(mf2);
	res = await mf2.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #5: 1");

	// Check doesn't persist with `unsafeEphemeralDurableObjects` enabled
	await mf2.setOptions(counterOpts("Options #6: ", { ephemeral: true }));
	res = await mf2.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #6: 1");
	res = await mf2.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #6: 2");
	await mf2.setOptions(counterOpts("Options #6: ", { ephemeral: true }));
	res = await mf2.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #6: 1");
});

test("persists Durable Object data on file-system", async ({ expect }) => {
	const tmp = await useTmp();
	const opts: MiniflareOptions = {
		resourcePersistencePath: tmp,
		workers: [
			{
				config: {
					type: "worker",
					name: "worker",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(COUNTER_SCRIPT()),
					env: {
						COUNTER: {
							type: "durable-object",
							workerName: "worker",
							exportName: "Counter",
						},
					},
					exports: {
						Counter: { type: "durable-object", storage: "sqlite" },
					},
				},
			},
		],
	};
	const mf = new Miniflare(opts);
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("1");

	// Check directory created for "worker"'s Durable Object under the plugin subdirectory
	const doTmp = path.join(tmp, DURABLE_OBJECTS_PLUGIN_NAME);
	const names = await fs.readdir(doTmp);
	expect(names).toEqual(["worker-Counter"]);

	// Check reloading keeps persisted data
	await mf.setOptions(opts);
	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("2");

	// Check removing persisted data then reloaded resets count (note we have to
	// reload here as `workerd` keeps a copy of the SQLite database in-memory,
	// we also need to `dispose()` to avoid `EBUSY` error on Windows)
	await mf.dispose();
	await removeDir(path.join(doTmp, names[0]));

	const mf2 = new Miniflare(opts);
	useDispose(mf2);

	res = await mf2.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("1");

	// Check "restarting" keeps persisted data
	await mf2.dispose();
	const mf3 = new Miniflare(opts);
	useDispose(mf3);
	res = await mf3.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("2");
});

test("lists Durable Object ids with persisted storage", async ({ expect }) => {
	const tmp = await useTmp();
	const mf = new Miniflare({
		resourcePersistencePath: tmp,
		workers: [
			{
				config: {
					type: "worker",
					name: "worker",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(COUNTER_SCRIPT()),
					env: {
						COUNTER: {
							type: "durable-object",
							workerName: "worker",
							exportName: "Counter",
						},
					},
					exports: {
						Counter: { type: "durable-object", storage: "sqlite" },
					},
				},
			},
		],
	});
	useDispose(mf);

	const namespace = await mf.getDurableObjectNamespace("COUNTER");
	const firstId = namespace.idFromName("/first").toString();
	const secondId = namespace.idFromName("/second").toString();

	await expect(mf.listDurableObjectIds("COUNTER")).resolves.toEqual([]);

	let res = await mf.dispatchFetch("http://localhost/first");
	expect(await res.text()).toBe("1");
	res = await mf.dispatchFetch("http://localhost/second");
	expect(await res.text()).toBe("1");

	await expect(mf.listDurableObjectIds("COUNTER")).resolves.toEqual(
		[firstId, secondId].sort()
	);
	await expect(mf.listDurableObjectIds("Counter")).resolves.toEqual(
		[firstId, secondId].sort()
	);
});

test("multiple Workers access same Durable Object data", async ({ expect }) => {
	const tmp = await useTmp();
	const mf = new Miniflare({
		resourcePersistencePath: tmp,
		workers: [
			{
				config: {
					type: "worker",
					name: "entry",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`export default {
          async fetch(request, env, ctx) {
            request = new Request(request);
            const service = request.headers.get("MF-Test-Service");
            request.headers.delete("MF-Test-Service");
            const response = await env[service].fetch(request);
            const text = await response.text();
            return new Response(\`via \${service}: \${text}\`);
          }
        }`),
					env: {
						A: { type: "worker", workerName: "a" },
						B: { type: "worker", workerName: "b" },
					},
				},
			},
			{
				config: {
					type: "worker",
					name: "a",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(COUNTER_SCRIPT("a: ")),
					env: {
						COUNTER_A: {
							type: "durable-object",
							workerName: "a",
							exportName: "Counter",
						},
						COUNTER_B: {
							type: "durable-object",
							workerName: "b",
							exportName: "Counter",
						},
					},
					exports: {
						Counter: { type: "durable-object", storage: "sqlite" },
					},
				},
			},
			{
				config: {
					type: "worker",
					name: "b",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(COUNTER_SCRIPT("b: ")),
					env: {
						COUNTER_A: {
							type: "durable-object",
							workerName: "a",
							exportName: "Counter",
						},
						COUNTER_B: {
							type: "durable-object",
							workerName: "b",
							exportName: "Counter",
						},
					},
					exports: {
						Counter: { type: "durable-object", storage: "sqlite" },
					},
				},
			},
		],
	});
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost", {
		headers: { "MF-Test-Service": "A", "MF-Test-Object": "COUNTER_A" },
	});
	expect(await res.text()).toBe("via A: a: 1");
	res = await mf.dispatchFetch("http://localhost", {
		headers: { "MF-Test-Service": "A", "MF-Test-Object": "COUNTER_A" },
	});
	expect(await res.text()).toBe("via A: a: 2");
	res = await mf.dispatchFetch("http://localhost", {
		headers: { "MF-Test-Service": "A", "MF-Test-Object": "COUNTER_B" },
	});
	expect(await res.text()).toBe("via A: b: 1");

	// Check directory created for Durable Objects under the plugin subdirectory
	const names = await fs.readdir(path.join(tmp, DURABLE_OBJECTS_PLUGIN_NAME));
	expect(names.sort()).toEqual(["a-Counter", "b-Counter"]);

	// Check accessing via a different service accesses same persisted data
	res = await mf.dispatchFetch("http://localhost", {
		headers: { "MF-Test-Service": "B", "MF-Test-Object": "COUNTER_A" },
	});
	expect(await res.text()).toBe("via B: a: 3");
	res = await mf.dispatchFetch("http://localhost", {
		headers: { "MF-Test-Service": "B", "MF-Test-Object": "COUNTER_B" },
	});
	expect(await res.text()).toBe("via B: b: 2");
});

test("can use Durable Object ID from one object in another", async ({
	expect,
}) => {
	const mf1 = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "a",
					compatibilityDate: "2025-05-01",
					triggers: [{ type: "fetch", pattern: "*/id" }],
					manifest: singleModuleManifest(`
    export class b_B {}
    export default {
      fetch(request, env) {
        const id = env.OBJECT_B.newUniqueId();
        return new Response(id);
      }
    }
    `),
					env: {
						OBJECT_B: {
							type: "durable-object",
							workerName: "a",
							exportName: "b_B",
						},
					},
					exports: {
						b_B: {
							type: "durable-object",
							storage: "sqlite",
							unsafeUniqueKey: "b-B",
						},
					},
				},
				dev: { unsafeEphemeralDurableObjects: true },
			},
		],
	});
	const mf2 = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "b",
					compatibilityDate: "2025-05-01",
					triggers: [{ type: "fetch", pattern: "*/*" }],
					manifest: singleModuleManifest(`
    export class B {
      constructor(state) {
        this.state = state;
      }
      fetch() {
        return new Response("id:" + this.state.id);
      }
    }
    export default {
      fetch(request, env) {
        const url = new URL(request.url);
        const id = env.OBJECT_B.idFromString(url.pathname.substring(1));
        const stub = env.OBJECT_B.get(id);
        return stub.fetch(request);
      }
    }
    `),
					env: {
						OBJECT_B: {
							type: "durable-object",
							workerName: "b",
							exportName: "B",
						},
					},
					exports: {
						B: { type: "durable-object", storage: "sqlite" },
					},
				},
			},
		],
	});
	onTestFinished(async () => {
		await Promise.all([mf1.dispose(), mf2.dispose()]);
	});

	const idRes = await mf1.dispatchFetch("http://localhost/id");
	const id = await idRes.text();
	const res = await mf2.dispatchFetch(`http://localhost/${id}`);
	expect(await res.text()).toBe(`id:${id}`);
});

test("proxies Durable Object methods", async ({ expect }) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(COUNTER_SCRIPT("")),
					env: {
						COUNTER: {
							type: "durable-object",
							workerName: "",
							exportName: "Counter",
						},
					},
					exports: {
						Counter: { type: "durable-object", storage: "sqlite" },
					},
				},
			},
		],
	});
	useDispose(mf);

	// Check can call synchronous ID creation methods
	let ns = await mf.getDurableObjectNamespace("COUNTER");
	let id = ns.idFromName("/a");
	expect(String(id)).toMatch(/[0-9a-f]{64}/i);

	// Check using result of proxied method in another
	let stub = ns.get(id);
	let res = await stub.fetch("http://placeholder/");
	expect(await res.text()).toBe("1");

	// Check reuses exact same instance with un-proxied access
	res = await mf.dispatchFetch("http://localhost/a");
	expect(await res.text()).toBe("2");
	const requestId: RequestInit = { cf: { instanceId: true } };
	const proxyIdRes = await stub.fetch("http://placeholder/", requestId);
	const proxyId = await proxyIdRes.text();
	const regularIdRes = await mf.dispatchFetch("http://localhost/a", requestId);
	const regularId = await regularIdRes.text();
	expect(proxyId).toBe(regularId);

	// Check with WebSocket
	await mf.setOptions({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`
    export class WebSocketObject {
      fetch() {
        const [webSocket1, webSocket2] = Object.values(new WebSocketPair());
        webSocket1.accept();
        webSocket1.addEventListener("message", (event) => {
          webSocket1.send("echo:" + event.data);
        });
        return new Response(null, { status: 101, webSocket: webSocket2 });
      }
    }
    export default {
      fetch(request, env) { return new Response(null, { status: 404 }); }
    }
    `),
					env: {
						WEBSOCKET: {
							type: "durable-object",
							workerName: "",
							exportName: "WebSocketObject",
						},
					},
					exports: {
						WebSocketObject: { type: "durable-object", storage: "sqlite" },
					},
				},
			},
		],
	});
	ns = await mf.getDurableObjectNamespace("WEBSOCKET");
	id = ns.newUniqueId();
	stub = ns.get(id);
	res = await stub.fetch("http://placeholder/", {
		headers: { Upgrade: "websocket" },
	});
	assert(res.webSocket !== null);
	const eventPromise = new DeferredPromise<MessageEvent>();
	res.webSocket.addEventListener("message", eventPromise.resolve);
	res.webSocket.accept();
	res.webSocket.send("hello");
	const event = await eventPromise;
	expect(event.data).toBe("echo:hello");
});

describe("evictions", { concurrent: true }, () => {
	test("Durable Object eviction", async ({ expect, onTestFinished }) => {
		// this test requires testing over a 10 second timeout
		// first set unsafePreventEviction to undefined
		const mf = new Miniflare({
			workers: [
				{
					config: {
						type: "worker",
						name: "",
						compatibilityDate: "2025-05-01",
						manifest: singleModuleManifest(STATEFUL_SCRIPT()),
						env: {
							DURABLE_OBJECT: {
								type: "durable-object",
								workerName: "",
								exportName: "DurableObject",
							},
						},
						exports: {
							DurableObject: { type: "durable-object", storage: "sqlite" },
						},
					},
				},
			],
		});
		// Use onTestFinished from test context (not imported) for proper scoping
		// with concurrent tests, combined with disposeWithRetry for Windows support
		onTestFinished(() => disposeWithRetry(mf));

		// get uuid generated at durable object startup
		let res = await mf.dispatchFetch("http://localhost");
		const original = await res.text();

		// after 10+ seconds, durable object should be evicted, so new uuid generated
		await setTimeout(10_000);
		res = await mf.dispatchFetch("http://localhost");
		expect(await res.text()).not.toBe(original);
	});

	test("prevent Durable Object eviction", async ({
		expect,
		onTestFinished,
	}) => {
		// this test requires testing over a 10 second timeout
		// first set unsafePreventEviction to true
		const mf = new Miniflare({
			workers: [
				{
					config: {
						type: "worker",
						name: "",
						compatibilityDate: "2025-05-01",
						manifest: singleModuleManifest(STATEFUL_SCRIPT()),
						env: {
							DURABLE_OBJECT: {
								type: "durable-object",
								workerName: "",
								exportName: "DurableObject",
							},
						},
						exports: {
							DurableObject: {
								type: "durable-object",
								storage: "sqlite",
								unsafePreventEviction: true,
							},
						},
					},
				},
			],
		});
		// Use onTestFinished from test context (not imported) for proper scoping
		// with concurrent tests, combined with disposeWithRetry for Windows support
		onTestFinished(() => disposeWithRetry(mf));

		// get uuid generated at durable object startup
		let res = await mf.dispatchFetch("http://localhost");
		const original = await res.text();

		// after 10+ seconds, durable object should NOT be evicted, so same uuid
		await setTimeout(10_000);
		res = await mf.dispatchFetch("http://localhost");
		expect(await res.text()).toBe(original);
	});
});

const MINIFLARE_WITH_SQLITE = (useSQLite: boolean) =>
	new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`export class SQLiteDurableObject {
			constructor(ctx) { this.ctx = ctx; }
			fetch() {
				try {
					return new Response(this.ctx.storage.sql.databaseSize);
				} catch (error) {
					if (error instanceof Error) {
						return new Response(error.message);
					}
					throw error;
				}
			}
		}
		export default {
			fetch(req, env, ctx) {
				const id = env.SQLITE_DURABLE_OBJECT.idFromName("foo");
				const stub = env.SQLITE_DURABLE_OBJECT.get(id);
				return stub.fetch(req);
			}
		}`),
					env: {
						SQLITE_DURABLE_OBJECT: {
							type: "durable-object",
							workerName: "",
							exportName: "SQLiteDurableObject",
						},
					},
					exports: {
						SQLiteDurableObject: {
							type: "durable-object",
							storage: useSQLite ? "sqlite" : "legacy-kv",
						},
					},
				},
			},
		],
	});

test("SQLite is available in SQLite backed Durable Objects", async ({
	expect,
}) => {
	const mf = MINIFLARE_WITH_SQLITE(true);
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("4096");

	const ns = await mf.getDurableObjectNamespace("SQLITE_DURABLE_OBJECT");
	const id = ns.newUniqueId();
	const stub = ns.get(id);
	res = await stub.fetch("http://localhost");
	expect(await res.text()).toBe("4096");
});

test("gets SQLite storage for Durable Objects", async ({ expect }) => {
	const mf = new Miniflare({
		unsafeInspectDurableObjects: true,
		workers: [
			{
				config: {
					type: "worker",
					name: "worker",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`
			import { DurableObject } from "cloudflare:workers";

			export class TestObject extends DurableObject {
				constructor(ctx, env) {
					super(ctx, env);
					this.ctx.storage.sql.exec(
						"CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, value TEXT)"
					);
				}

				fetch(request) {
					const url = new URL(request.url);
					const sql = this.ctx.storage.sql;

					if (url.pathname === "/write") {
						sql.exec(
							"INSERT OR REPLACE INTO entries (id, value) VALUES ('key', ?)",
							url.searchParams.get("value")
						);
						return new Response("ok");
					}

					const row = sql.exec("SELECT value FROM entries WHERE id = 'key'").one();
					return new Response(row?.value ?? "missing");
				}
			}

			export default {
				fetch(request, env) {
					const name = new URL(request.url).searchParams.get("name") ?? "by-name";
					const id = env.OBJECT.idFromName(name);
					return env.OBJECT.get(id).fetch(request);
				}
			}
		`),
					env: {
						OBJECT: {
							type: "durable-object",
							workerName: "worker",
							exportName: "TestObject",
						},
					},
					exports: {
						TestObject: { type: "durable-object", storage: "sqlite" },
					},
				},
			},
		],
	});
	useDispose(mf);

	const storageByName = await mf.unsafeGetDurableObjectStorage(
		"worker",
		"TestObject",
		{
			name: "by-name",
		}
	);
	await storageByName.exec(
		"INSERT INTO entries (id, value) VALUES ('key', ?)",
		"seeded"
	);

	const response1 = await mf.dispatchFetch("http://localhost/read");
	expect(await response1.text()).toBe("seeded");

	const response2 = await mf.dispatchFetch("http://localhost/write?value=app");
	expect(await response2.text()).toBe("ok");

	const rows = await storageByName.exec<{ value: string }>(
		"SELECT value FROM entries WHERE id = 'key'"
	);
	expect(rows).toEqual([{ value: "app" }]);

	const namespace = await mf.getDurableObjectNamespace("OBJECT");
	const storageById = await mf.unsafeGetDurableObjectStorage(
		"worker",
		"TestObject",
		{
			id: namespace.idFromName("by-id").toString(),
		}
	);
	await storageById.exec(
		"INSERT INTO entries (id, value) VALUES ('key', ?)",
		"seeded-by-id"
	);

	const response3 = await mf.dispatchFetch("http://localhost/read?name=by-id");
	expect(await response3.text()).toBe("seeded-by-id");
});

test("SQLite is not available in default Durable Objects", async ({
	expect,
}) => {
	const mf = MINIFLARE_WITH_SQLITE(false);
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost");
	let text = await res.text();
	expect(text).toBeTruthy();
	expect(
		text.startsWith("SQL is not enabled for this Durable Object class.")
	).toBe(true);

	const ns = await mf.getDurableObjectNamespace("SQLITE_DURABLE_OBJECT");
	const id = ns.newUniqueId();
	const stub = ns.get(id);
	res = await stub.fetch("http://localhost");
	text = await res.text();
	expect(text).toBeTruthy();
	expect(
		text.startsWith("SQL is not enabled for this Durable Object class.")
	).toBe(true);
});

test("colo-local actors", async ({ expect }) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(`export class TestObject {
			constructor(state) { this.state = state; }
			fetch() { return new Response("body:" + this.state.id); }
		}
		export default {
			fetch(request, env, ctx) {
				const stub = env.OBJECT.get("thing1");
				return stub.fetch(request);
			}
		}`),
					env: {
						OBJECT: {
							type: "durable-object",
							workerName: "",
							exportName: "TestObject",
						},
					},
					exports: {
						TestObject: {
							type: "durable-object",
							storage: "sqlite",
							unsafeUniqueKey: kUnsafeEphemeralUniqueKey,
						},
					},
				},
			},
		],
	});
	useDispose(mf);
	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("body:thing1");

	const ns = await mf.getDurableObjectNamespace("OBJECT");
	// @ts-expect-error `ColoLocalActorNamespace`s are not included in types
	const stub = ns.get("thing2");
	res = await stub.fetch("http://localhost");
	expect(await res.text()).toBe("body:thing2");

	await expect(mf.listDurableObjectIds("OBJECT")).rejects.toThrow(
		`Cannot list Durable Object ids for "OBJECT" because the namespace uses ephemeral local storage.`
	);
});

test("multiple workers with DO useSQLite true and undefined does not cause options error", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "worker-a",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest("export default {}"),
				},
			},
		],
	});

	useDispose(mf);

	await expect(
		mf.setOptions({
			workers: [
				{
					config: {
						type: "worker",
						name: "worker-a",
						compatibilityDate: "2025-05-01",
						manifest: singleModuleManifest(`
							import { DurableObject } from "cloudflare:workers";

							export class MyDo extends DurableObject {}

							export default { }
						`),
						env: {
							MY_DO: {
								type: "durable-object",
								workerName: "worker-a",
								exportName: "MyDo",
							},
						},
						exports: {
							MyDo: { type: "durable-object", storage: "sqlite" },
						},
					},
				},
				{
					config: {
						type: "worker",
						name: "worker-b",
						compatibilityDate: "2025-05-01",
						manifest: singleModuleManifest("export default {}"),
						env: {
							MY_DO: {
								type: "durable-object",
								workerName: "worker-a",
								exportName: "MyDo",
							},
						},
					},
				},
			],
		})
	).resolves.not.toThrow();
});

const BLOCKING_DO_SCRIPT = `
import { DurableObject } from 'cloudflare:workers';

export class BlockingDO extends DurableObject {
	locks = new Map();

	blockedOp(n, lock) {
		return new Promise((resolve) => {
			this.locks.set(lock, () => resolve(lock));
		}).then(() =>  n + 2);
	}

	release(lock) {
		const releaseFn = this.locks.get(lock);
		if (releaseFn) {
			releaseFn();
			this.locks.delete(lock);
		}
	}
}

export default {
	fetch() { return new Response("OK"); }
}
`;

test("Durable Object RPC calls do not block Node.js event loop", async ({
	expect,
}) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(BLOCKING_DO_SCRIPT),
					env: {
						BLOCKING_DO: {
							type: "durable-object",
							workerName: "",
							exportName: "BlockingDO",
						},
					},
					exports: {
						BlockingDO: { type: "durable-object", storage: "sqlite" },
					},
				},
			},
		],
	});

	useDispose(mf);

	const namespace = await mf.getDurableObjectNamespace("BLOCKING_DO");
	const stubId = namespace.idFromName("test");
	const stub = namespace.get(stubId) as unknown as {
		blockedOp: (n: number, lock: string) => Promise<number>;
		release: (lock: string) => Promise<void>;
	};

	const blockedPromise = stub.blockedOp(5, "lock-1");

	const raced = await Promise.race([
		blockedPromise.then((result) => ({ type: "resolved", result })),
		setTimeout(100).then(() => ({ type: "timeout" })),
	]);

	// If the event loop wasn't blocked, the timeout should win
	expect(raced).toEqual({ type: "timeout" });
});

test("Durable Object RPC calls complete when unblocked", async ({ expect }) => {
	const mf = new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-05-01",
					manifest: singleModuleManifest(BLOCKING_DO_SCRIPT),
					env: {
						BLOCKING_DO: {
							type: "durable-object",
							workerName: "",
							exportName: "BlockingDO",
						},
					},
					exports: {
						BlockingDO: { type: "durable-object", storage: "sqlite" },
					},
				},
			},
		],
	});

	useDispose(mf);

	const namespace = await mf.getDurableObjectNamespace("BLOCKING_DO");
	const stubId = namespace.idFromName("test");
	const stub = namespace.get(stubId) as unknown as {
		blockedOp: (n: number, lock: string) => Promise<number>;
		release: (lock: string) => Promise<void>;
	};

	const blockedPromise = stub.blockedOp(10, "lock-2");

	// Race the blocked operation against a timeout, releasing the lock as part of the race.
	// The release should cause `blockedPromise` to resolve before the timeout.
	// Use a generous timeout (5s) to avoid flakiness in CI environments.
	const raced = await Promise.race([
		blockedPromise.then((result) => ({ type: "resolved", result })),
		stub
			.release("lock-2")
			.then(() => setTimeout(5_000))
			.then(() => ({ type: "timeout" })),
	]);

	expect(raced).toEqual({ type: "resolved", result: 12 });
});
