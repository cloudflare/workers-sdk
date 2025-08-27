import assert from "assert";
import fs from "fs/promises";
import path from "path";
import { setTimeout } from "timers/promises";
import test from "ava";
import {
	DeferredPromise,
	kUnsafeEphemeralUniqueKey,
	MessageEvent,
	Miniflare,
	MiniflareOptions,
	RequestInit,
} from "miniflare";
import { useTmp } from "../../test-shared";

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

test("persists Durable Object data in-memory between options reloads", async (t) => {
	const opts: MiniflareOptions = {
		modules: true,
		script: COUNTER_SCRIPT("Options #1: "),
		durableObjects: { COUNTER: "Counter" },
	};
	let mf = new Miniflare(opts);
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "Options #1: 1");

	opts.script = COUNTER_SCRIPT("Options #2: ");
	await mf.setOptions(opts);
	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "Options #2: 2");

	opts.durableObjectsPersist = false;
	opts.script = COUNTER_SCRIPT("Options #3: ");
	await mf.setOptions(opts);
	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "Options #3: 3");

	opts.durableObjectsPersist = "memory:";
	opts.script = COUNTER_SCRIPT("Options #4: ");
	await mf.setOptions(opts);
	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "Options #4: 4");

	// Check a `new Miniflare()` instance has its own in-memory storage
	delete opts.durableObjectsPersist;
	opts.script = COUNTER_SCRIPT("Options #5: ");
	await mf.dispose();
	mf = new Miniflare(opts);
	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "Options #5: 1");

	// Check doesn't persist with `unsafeEphemeralDurableObjects` enabled
	opts.script = COUNTER_SCRIPT("Options #6: ");
	opts.unsafeEphemeralDurableObjects = true;
	await mf.setOptions(opts);
	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "Options #6: 1");
	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "Options #6: 2");
	await mf.setOptions(opts);
	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "Options #6: 1");
});

test("persists Durable Object data on file-system", async (t) => {
	const tmp = await useTmp(t);
	const opts: MiniflareOptions = {
		name: "worker",
		modules: true,
		script: COUNTER_SCRIPT(),
		durableObjects: { COUNTER: "Counter" },
		durableObjectsPersist: tmp,
	};
	let mf = new Miniflare(opts);
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "1");

	// Check directory created for "worker"'s Durable Object
	const names = await fs.readdir(tmp);
	t.deepEqual(names, ["worker-Counter"]);

	// Check reloading keeps persisted data
	await mf.setOptions(opts);
	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "2");

	// Check removing persisted data then reloaded resets count (note we have to
	// reload here as `workerd` keeps a copy of the SQLite database in-memory,
	// we also need to `dispose()` to avoid `EBUSY` error on Windows)
	await mf.dispose();
	await fs.rm(path.join(tmp, names[0]), { force: true, recursive: true });

	mf = new Miniflare(opts);
	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "1");

	// Check "restarting" keeps persisted data
	await mf.dispose();
	mf = new Miniflare(opts);
	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "2");
});

test("multiple Workers access same Durable Object data", async (t) => {
	const tmp = await useTmp(t);
	const mf = new Miniflare({
		durableObjectsPersist: tmp,
		workers: [
			{
				name: "entry",
				modules: true,
				script: `export default {
          async fetch(request, env, ctx) {
            request = new Request(request);
            const service = request.headers.get("MF-Test-Service");
            request.headers.delete("MF-Test-Service");
            const response = await env[service].fetch(request);
            const text = await response.text();
            return new Response(\`via \${service}: \${text}\`);
          }
        }`,
				serviceBindings: { A: "a", B: "b" },
			},
			{
				name: "a",
				modules: true,
				script: COUNTER_SCRIPT("a: "),
				durableObjects: {
					COUNTER_A: "Counter",
					COUNTER_B: { className: "Counter", scriptName: "b" },
				},
			},
			{
				name: "b",
				modules: true,
				script: COUNTER_SCRIPT("b: "),
				durableObjects: {
					COUNTER_A: { className: "Counter", scriptName: "a" },
					COUNTER_B: "Counter",
				},
			},
		],
	});
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("http://localhost", {
		headers: { "MF-Test-Service": "A", "MF-Test-Object": "COUNTER_A" },
	});
	t.is(await res.text(), "via A: a: 1");
	res = await mf.dispatchFetch("http://localhost", {
		headers: { "MF-Test-Service": "A", "MF-Test-Object": "COUNTER_A" },
	});
	t.is(await res.text(), "via A: a: 2");
	res = await mf.dispatchFetch("http://localhost", {
		headers: { "MF-Test-Service": "A", "MF-Test-Object": "COUNTER_B" },
	});
	t.is(await res.text(), "via A: b: 1");

	// Check directory created for Durable Objects
	const names = await fs.readdir(tmp);
	t.deepEqual(names.sort(), ["a-Counter", "b-Counter"]);

	// Check accessing via a different service accesses same persisted data
	res = await mf.dispatchFetch("http://localhost", {
		headers: { "MF-Test-Service": "B", "MF-Test-Object": "COUNTER_A" },
	});
	t.is(await res.text(), "via B: a: 3");
	res = await mf.dispatchFetch("http://localhost", {
		headers: { "MF-Test-Service": "B", "MF-Test-Object": "COUNTER_B" },
	});
	t.is(await res.text(), "via B: b: 2");
});

test("can use Durable Object ID from one object in another", async (t) => {
	const mf1 = new Miniflare({
		name: "a",
		routes: ["*/id"],
		unsafeEphemeralDurableObjects: true,
		durableObjects: {
			OBJECT_B: { className: "b_B", unsafeUniqueKey: "b-B" },
		},
		modules: true,
		script: `
    export class b_B {}
    export default {
      fetch(request, env) {
        const id = env.OBJECT_B.newUniqueId();
        return new Response(id);
      }
    }
    `,
	});
	const mf2 = new Miniflare({
		name: "b",
		routes: ["*/*"],
		durableObjects: { OBJECT_B: "B" },
		modules: true,
		script: `
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
    `,
	});
	t.teardown(() => Promise.all([mf1.dispose(), mf2.dispose()]));

	const idRes = await mf1.dispatchFetch("http://localhost/id");
	const id = await idRes.text();
	const res = await mf2.dispatchFetch(`http://localhost/${id}`);
	t.is(await res.text(), `id:${id}`);
});

test("proxies Durable Object methods", async (t) => {
	const mf = new Miniflare({
		verbose: true,
		modules: true,
		script: COUNTER_SCRIPT(""),
		durableObjects: { COUNTER: "Counter" },
	});
	t.teardown(() => mf.dispose());

	// Check can call synchronous ID creation methods
	let ns = await mf.getDurableObjectNamespace("COUNTER");
	let id = ns.idFromName("/a");
	t.regex(String(id), /[0-9a-f]{64}/i);

	// Check using result of proxied method in another
	let stub = ns.get(id);
	let res = await stub.fetch("http://placeholder/");
	t.is(await res.text(), "1");

	// Check reuses exact same instance with un-proxied access
	res = await mf.dispatchFetch("http://localhost/a");
	t.is(await res.text(), "2");
	const requestId: RequestInit = { cf: { instanceId: true } };
	const proxyIdRes = await stub.fetch("http://placeholder/", requestId);
	const proxyId = await proxyIdRes.text();
	const regularIdRes = await mf.dispatchFetch("http://localhost/a", requestId);
	const regularId = await regularIdRes.text();
	t.is(proxyId, regularId);

	// Check with WebSocket
	await mf.setOptions({
		verbose: true,
		modules: true,
		script: `
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
    `,
		durableObjects: { WEBSOCKET: "WebSocketObject" },
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
	t.is(event.data, "echo:hello");
});

test("Durable Object eviction", async (t) => {
	// this test requires testing over a 10 second timeout
	t.timeout(20_000);

	// first set unsafePreventEviction to undefined
	const mf = new Miniflare({
		verbose: true,
		modules: true,
		script: STATEFUL_SCRIPT(),
		durableObjects: {
			DURABLE_OBJECT: "DurableObject",
		},
	});
	t.teardown(() => mf.dispose());

	// get uuid generated at durable object startup
	let res = await mf.dispatchFetch("http://localhost");
	const original = await res.text();

	// after 10+ seconds, durable object should be evicted, so new uuid generated
	await setTimeout(10_000);
	res = await mf.dispatchFetch("http://localhost");
	t.not(await res.text(), original);
});

test("prevent Durable Object eviction", async (t) => {
	// this test requires testing over a 10 second timeout
	t.timeout(20_000);

	// first set unsafePreventEviction to undefined
	const mf = new Miniflare({
		verbose: true,
		modules: true,
		script: STATEFUL_SCRIPT(),
		durableObjects: {
			DURABLE_OBJECT: {
				className: "DurableObject",
				unsafePreventEviction: true,
			},
		},
	});
	t.teardown(() => mf.dispose());

	// get uuid generated at durable object startup
	let res = await mf.dispatchFetch("http://localhost");
	const original = await res.text();

	// after 10+ seconds, durable object should NOT be evicted, so same uuid
	await setTimeout(10_000);
	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), original);
});

const MINIFLARE_WITH_SQLITE = (useSQLite: boolean) =>
	new Miniflare({
		verbose: true,
		modules: true,
		script: `export class SQLiteDurableObject {
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
				console.log({id})
				const stub = env.SQLITE_DURABLE_OBJECT.get(id);
				return stub.fetch(req);
			}
		}`,
		durableObjects: {
			SQLITE_DURABLE_OBJECT: {
				className: "SQLiteDurableObject",
				useSQLite,
			},
		},
	});

test("SQLite is available in SQLite backed Durable Objects", async (t) => {
	const mf = MINIFLARE_WITH_SQLITE(true);
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "4096");

	const ns = await mf.getDurableObjectNamespace("SQLITE_DURABLE_OBJECT");
	const id = ns.newUniqueId();
	const stub = ns.get(id);
	res = await stub.fetch("http://localhost");
	t.is(await res.text(), "4096");
});

test("SQLite is not available in default Durable Objects", async (t) => {
	const mf = MINIFLARE_WITH_SQLITE(false);
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("http://localhost");
	t.assert(
		(await res.text()).startsWith(
			"SQL is not enabled for this Durable Object class."
		)
	);

	const ns = await mf.getDurableObjectNamespace("SQLITE_DURABLE_OBJECT");
	const id = ns.newUniqueId();
	const stub = ns.get(id);
	res = await stub.fetch("http://localhost");
	t.assert(
		(await res.text()).startsWith(
			"SQL is not enabled for this Durable Object class."
		)
	);
});

test("colo-local actors", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: `export class TestObject {
			constructor(state) { this.state = state; }
			fetch() { return new Response("body:" + this.state.id); }
		}
		export default {
			fetch(request, env, ctx) {
				const stub = env.OBJECT.get("thing1");
				return stub.fetch(request);
			}
		}`,
		durableObjects: {
			OBJECT: {
				className: "TestObject",
				unsafeUniqueKey: kUnsafeEphemeralUniqueKey,
			},
		},
	});
	t.teardown(() => mf.dispose());
	let res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "body:thing1");

	const ns = await mf.getDurableObjectNamespace("OBJECT");
	// @ts-expect-error `ColoLocalActorNamespace`s are not included in types
	const stub = ns.get("thing2");
	res = await stub.fetch("http://localhost");
	t.is(await res.text(), "body:thing2");
});

test("multiple workers with DO conflicting useSQLite booleans cause options error", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				modules: true,
				name: "worker-a",
				script: "export default {}",
			},
		],
	});

	t.teardown(() => mf.dispose());

	await t.throwsAsync(
		async () => {
			await mf.setOptions({
				workers: [
					{
						modules: true,
						name: "worker-c",
						script: "export default {}",
						durableObjects: {
							MY_DO: {
								className: "MyDo",
								scriptName: "worker-a",
								useSQLite: false,
							},
						},
					},
					{
						modules: true,
						name: "worker-a",
						script: `
							import { DurableObject } from "cloudflare:workers";

							export class MyDo extends DurableObject {}

							export default { }
						`,
						durableObjects: {
							MY_DO: {
								className: "MyDo",
								scriptName: undefined,
								useSQLite: true,
							},
						},
					},
					{
						modules: true,
						name: "worker-b",
						script: "export default {}",
						durableObjects: {
							MY_DO: {
								className: "MyDo",
								scriptName: "worker-a",
								useSQLite: false,
							},
						},
					},
				],
			});
		},
		{
			instanceOf: Error,
			message:
				'Different storage backends defined for Durable Object "MyDo" in "core:user:worker-a": false and true',
		}
	);
});

test("multiple workers with DO useSQLite true and undefined does not cause options error", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				modules: true,
				name: "worker-a",
				script: "export default {}",
			},
		],
	});

	t.teardown(() => mf.dispose());

	await t.notThrowsAsync(async () => {
		await mf.setOptions({
			workers: [
				{
					modules: true,
					name: "worker-a",
					script: `
							import { DurableObject } from "cloudflare:workers";

							export class MyDo extends DurableObject {}

							export default { }
						`,
					durableObjects: {
						MY_DO: {
							className: "MyDo",
							scriptName: undefined,
							useSQLite: true,
						},
					},
				},
				{
					modules: true,
					name: "worker-b",
					script: "export default {}",
					durableObjects: {
						MY_DO: {
							className: "MyDo",
							scriptName: "worker-a",
							useSQLite: undefined,
						},
					},
				},
			],
		});
	});
});
