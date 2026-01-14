import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import {
	DeferredPromise,
	kUnsafeEphemeralUniqueKey,
	MessageEvent,
	Miniflare,
	MiniflareOptions,
	RequestInit,
} from "miniflare";
import { describe, expect, onTestFinished, test } from "vitest";
import { disposeWithRetry, useDispose, useTmp } from "../../test-shared";

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

test("persists Durable Object data in-memory between options reloads", async () => {
	const opts: MiniflareOptions = {
		modules: true,
		script: COUNTER_SCRIPT("Options #1: "),
		durableObjects: { COUNTER: "Counter" },
	};
	const mf = new Miniflare(opts);
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #1: 1");

	opts.script = COUNTER_SCRIPT("Options #2: ");
	await mf.setOptions(opts);
	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #2: 2");

	opts.durableObjectsPersist = false;
	opts.script = COUNTER_SCRIPT("Options #3: ");
	await mf.setOptions(opts);
	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #3: 3");

	opts.durableObjectsPersist = "memory:";
	opts.script = COUNTER_SCRIPT("Options #4: ");
	await mf.setOptions(opts);
	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #4: 4");

	// Check a `new Miniflare()` instance has its own in-memory storage
	delete opts.durableObjectsPersist;
	opts.script = COUNTER_SCRIPT("Options #5: ");
	await mf.dispose();
	const mf2 = new Miniflare(opts);
	useDispose(mf2);
	res = await mf2.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #5: 1");

	// Check doesn't persist with `unsafeEphemeralDurableObjects` enabled
	opts.script = COUNTER_SCRIPT("Options #6: ");
	opts.unsafeEphemeralDurableObjects = true;
	await mf2.setOptions(opts);
	res = await mf2.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #6: 1");
	res = await mf2.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #6: 2");
	await mf2.setOptions(opts);
	res = await mf2.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Options #6: 1");
});

test("persists Durable Object data on file-system", async () => {
	const tmp = await useTmp();
	const opts: MiniflareOptions = {
		name: "worker",
		modules: true,
		script: COUNTER_SCRIPT(),
		durableObjects: { COUNTER: "Counter" },
		durableObjectsPersist: tmp,
	};
	const mf = new Miniflare(opts);
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("1");

	// Check directory created for "worker"'s Durable Object
	const names = await fs.readdir(tmp);
	expect(names).toEqual(["worker-Counter"]);

	// Check reloading keeps persisted data
	await mf.setOptions(opts);
	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("2");

	// Check removing persisted data then reloaded resets count (note we have to
	// reload here as `workerd` keeps a copy of the SQLite database in-memory,
	// we also need to `dispose()` to avoid `EBUSY` error on Windows)
	await mf.dispose();
	await fs.rm(path.join(tmp, names[0]), { force: true, recursive: true });

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

test("multiple Workers access same Durable Object data", async () => {
	const tmp = await useTmp();
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

	// Check directory created for Durable Objects
	const names = await fs.readdir(tmp);
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

test("can use Durable Object ID from one object in another", async () => {
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
	onTestFinished(async () => {
		await Promise.all([mf1.dispose(), mf2.dispose()]);
	});

	const idRes = await mf1.dispatchFetch("http://localhost/id");
	const id = await idRes.text();
	const res = await mf2.dispatchFetch(`http://localhost/${id}`);
	expect(await res.text()).toBe(`id:${id}`);
});

test("proxies Durable Object methods", async () => {
	const mf = new Miniflare({
		modules: true,
		script: COUNTER_SCRIPT(""),
		durableObjects: { COUNTER: "Counter" },
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
	expect(event.data).toBe("echo:hello");
});

describe("evictions", { concurrent: true }, () => {
	test("Durable Object eviction", async ({ onTestFinished }) => {
		// this test requires testing over a 10 second timeout
		// first set unsafePreventEviction to undefined
		const mf = new Miniflare({
			modules: true,
			script: STATEFUL_SCRIPT(),
			durableObjects: {
				DURABLE_OBJECT: "DurableObject",
			},
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

	test("prevent Durable Object eviction", async ({ onTestFinished }) => {
		// this test requires testing over a 10 second timeout
		// first set unsafePreventEviction to true
		const mf = new Miniflare({
			modules: true,
			script: STATEFUL_SCRIPT(),
			durableObjects: {
				DURABLE_OBJECT: {
					className: "DurableObject",
					unsafePreventEviction: true,
				},
			},
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

test("SQLite is available in SQLite backed Durable Objects", async () => {
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

test("SQLite is not available in default Durable Objects", async () => {
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

test("colo-local actors", async () => {
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
	useDispose(mf);
	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("body:thing1");

	const ns = await mf.getDurableObjectNamespace("OBJECT");
	// @ts-expect-error `ColoLocalActorNamespace`s are not included in types
	const stub = ns.get("thing2");
	res = await stub.fetch("http://localhost");
	expect(await res.text()).toBe("body:thing2");
});

test("multiple workers with DO conflicting useSQLite booleans cause options error", async () => {
	const mf = new Miniflare({
		workers: [
			{
				modules: true,
				name: "worker-a",
				script: "export default {}",
			},
		],
	});

	useDispose(mf);

	await expect(async () => {
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
	}).rejects.toThrow(
		'Different storage backends defined for Durable Object "MyDo" in "core:user:worker-a": false and true'
	);
});

test("multiple workers with DO useSQLite true and undefined does not cause options error", async () => {
	const mf = new Miniflare({
		workers: [
			{
				modules: true,
				name: "worker-a",
				script: "export default {}",
			},
		],
	});

	useDispose(mf);

	await expect(
		mf.setOptions({
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

test("Durable Object RPC calls do not block Node.js event loop", async () => {
	const mf = new Miniflare({
		durableObjects: { BLOCKING_DO: "BlockingDO" },
		modules: true,
		script: BLOCKING_DO_SCRIPT,
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

test("Durable Object RPC calls complete when unblocked", async () => {
	const mf = new Miniflare({
		durableObjects: { BLOCKING_DO: "BlockingDO" },
		modules: true,
		script: BLOCKING_DO_SCRIPT,
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
