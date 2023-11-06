import assert from "assert";
import { Blob } from "buffer";
import { text } from "stream/consumers";
import { ReadableStream } from "stream/web";
import util from "util";
import type { Fetcher } from "@cloudflare/workers-types/experimental";
import test, { ThrowsExpectation } from "ava";
import {
	DeferredPromise,
	File,
	MessageEvent,
	Miniflare,
	ReplaceWorkersTypes,
	Response,
	WebSocketPair,
} from "miniflare";

// This file tests API proxy edge cases. Cache, D1, Durable Object and R2 tests
// make extensive use of the API proxy, testing their specific special cases.

const nullScript =
	'addEventListener("fetch", (event) => event.respondWith(new Response(null, { status: 404 })));';

test("ProxyClient: supports service bindings with WebSockets", async (t) => {
	const mf = new Miniflare({
		script: nullScript,
		serviceBindings: {
			CUSTOM() {
				const { 0: webSocket1, 1: webSocket2 } = new WebSocketPair();
				webSocket1.accept();
				webSocket1.addEventListener("message", (event) => {
					webSocket1.send(`echo:${event.data}`);
				});
				return new Response(null, { status: 101, webSocket: webSocket2 });
			},
		},
	});
	t.teardown(() => mf.dispose());

	const { CUSTOM } = await mf.getBindings<{
		CUSTOM: ReplaceWorkersTypes<Fetcher>;
	}>();

	const res = await CUSTOM.fetch("http://placeholder/", {
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

test("ProxyClient: supports serialising multiple ReadableStreams, Blobs and Files", async (t) => {
	// For testing proxy client serialisation, add an API that just returns its
	// arguments. Note without the `.pipeThrough(new TransformStream())` below,
	// we'll see `TypeError: Inter-TransformStream ReadableStream.pipeTo() is
	// not implemented.`. `IdentityTransformStream` doesn't work here.
	const mf = new Miniflare({
		workers: [
			{
				name: "entry",
				modules: true,
				script: "",
				wrappedBindings: { IDENTITY: "identity" },
			},
			{
				name: "identity",
				modules: true,
				script: `
				class Identity {
					async asyncIdentity(...args) {
						const i = args.findIndex((arg) => arg instanceof ReadableStream);
						if (i !== -1) args[i] = args[i].pipeThrough(new TransformStream());
						return args;
					}
				}
				export default function() { return new Identity(); }
				`,
			},
		],
	});
	t.teardown(() => mf.dispose());

	const client = await mf._getProxyClient();
	const IDENTITY = client.env["MINIFLARE_PROXY:core:entry:IDENTITY"] as {
		asyncIdentity<Args extends any[]>(...args: Args): Promise<Args>;
	};

	// Test serialising multiple ReadableStreams
	const streamResult = await IDENTITY.asyncIdentity(
		new Blob(["hello"]).stream(),
		new Blob(["abc"]).stream(),
		new Blob(["123"]).stream()
	);
	const streamTexts = await Promise.all(streamResult.map(text));
	t.deepEqual(streamTexts, ["hello", "abc", "123"]);

	// Test serialising single Blob
	const [blobResult] = await IDENTITY.asyncIdentity(
		new Blob(["xyz"], { type: "text/plain" })
	);
	t.is(blobResult.type, "text/plain");
	t.is(await blobResult.text(), "xyz");

	// Test serialising ReadableStream, Blob and File
	const allResult = await IDENTITY.asyncIdentity(
		new Blob(["no type"]),
		new Blob(["stream"]).stream(),
		new File(["text file"], "text.txt", {
			type: "text/plain",
			lastModified: 1000,
		})
	);
	t.false(allResult[0] instanceof File);
	t.true(allResult[0] instanceof Blob);
	t.is(await allResult[0].text(), "no type");
	t.true(allResult[1] instanceof ReadableStream);
	t.is(await text(allResult[1]), "stream");
	t.true(allResult[2] instanceof File);
	t.is(allResult[2].type, "text/plain");
	t.is(allResult[2].lastModified, 1000);
	t.is(await allResult[2].text(), "text file");
});
test("ProxyClient: poisons dependent proxies after setOptions()/dispose()", async (t) => {
	const mf = new Miniflare({ script: nullScript });
	let disposed = false;
	t.teardown(() => {
		if (!disposed) return mf.dispose();
	});
	let caches = await mf.getCaches();
	let defaultCache = caches.default;
	let namedCache = await caches.open("name");

	const key = "http://localhost";
	await defaultCache.match(key);

	await mf.setOptions({ script: nullScript });

	const expectations: ThrowsExpectation<Error> = {
		message:
			"Attempted to use poisoned stub. Stubs to runtime objects must be re-created after calling `Miniflare#setOptions()` or `Miniflare#dispose()`.",
	};
	t.throws(() => caches.default, expectations);
	t.throws(() => defaultCache.match(key), expectations);
	t.throws(() => namedCache.match(key), expectations);

	caches = await mf.getCaches();
	defaultCache = caches.default;
	namedCache = await caches.open("name");

	await defaultCache.match(key);

	await mf.dispose();
	disposed = true;
	t.throws(() => caches.default, expectations);
	t.throws(() => defaultCache.match(key), expectations);
	t.throws(() => namedCache.match(key), expectations);
});
test("ProxyClient: logging proxies provides useful information", async (t) => {
	const mf = new Miniflare({ script: nullScript });
	t.teardown(() => mf.dispose());

	const caches = await mf.getCaches();
	const inspectOpts: util.InspectOptions = { colors: false };
	t.is(
		util.inspect(caches, inspectOpts),
		"ProxyStub { name: 'CacheStorage', poisoned: false }"
	);
	t.is(util.inspect(caches.open, inspectOpts), "[Function: open]");
});

test("ProxyClient: stack traces don't include internal implementation", async (t) => {
	function hasStack(value: unknown): value is { stack: string } {
		return (
			typeof value === "object" &&
			value !== null &&
			"stack" in value &&
			typeof value.stack === "string"
		);
	}

	const mf = new Miniflare({
		modules: true,
		script: `export class DurableObject {}    
    export default {
      fetch() { return new Response(null, { status: 404 }); }
    }`,
		durableObjects: { OBJECT: "DurableObject" },
		// Make sure asynchronous functions are rejecting, not throwing:
		// https://developers.cloudflare.com/workers/configuration/compatibility-dates/#do-not-throw-from-async-functions
		compatibilityFlags: ["capture_async_api_throws"],
	});
	t.teardown(() => mf.dispose());

	const ns = await mf.getDurableObjectNamespace("OBJECT");
	const caches = await mf.getCaches();

	function syncUserFunction() {
		try {
			ns.idFromString("bad id");
		} catch (e) {
			assert(hasStack(e));
			t.regex(e.stack, /syncUserFunction/);
			t.notRegex(e.stack, /ProxyStubHandler/);
		}
	}
	syncUserFunction();

	async function asyncUserFunction() {
		try {
			await caches.default.match("bad url");
			t.fail();
		} catch (e) {
			assert(hasStack(e));
			t.regex(e.stack, /asyncUserFunction/);
			t.notRegex(e.stack, /ProxyStubHandler/);
		}
	}
	await asyncUserFunction();
});
test("ProxyClient: can access ReadableStream property multiple times", async (t) => {
	const mf = new Miniflare({ script: nullScript, r2Buckets: ["BUCKET"] });
	t.teardown(() => mf.dispose());

	const bucket = await mf.getR2Bucket("BUCKET");
	await bucket.put("key", "value");
	const objectBody = await bucket.get("key");
	assert(objectBody != null);
	t.not(objectBody.body, null); // 1st access
	t.is(await text(objectBody.body), "value"); // 2nd access
});
test("ProxyClient: returns empty ReadableStream synchronously", async (t) => {
	const mf = new Miniflare({ script: nullScript, r2Buckets: ["BUCKET"] });
	t.teardown(() => mf.dispose());

	const bucket = await mf.getR2Bucket("BUCKET");
	await bucket.put("key", "");
	const objectBody = await bucket.get("key");
	assert(objectBody != null);
	t.is(await text(objectBody.body), ""); // Synchronous empty stream access
});
test("ProxyClient: can `JSON.stringify()` proxies", async (t) => {
	const mf = new Miniflare({ script: nullScript, r2Buckets: ["BUCKET"] });
	t.teardown(() => mf.dispose());

	const bucket = await mf.getR2Bucket("BUCKET");
	const object = await bucket.put("key", "value");
	assert(object !== null);
	t.is(Object.getPrototypeOf(object), null);
	const plainObject = JSON.parse(JSON.stringify(object));
	t.deepEqual(plainObject, {
		checksums: {
			md5: "2063c1608d6e0baf80249c42e2be5804",
		},
		customMetadata: {},
		etag: "2063c1608d6e0baf80249c42e2be5804",
		httpEtag: '"2063c1608d6e0baf80249c42e2be5804"',
		httpMetadata: {},
		key: "key",
		size: 5,
		uploaded: object.uploaded.toISOString(),
		version: object.version,
	});
});
