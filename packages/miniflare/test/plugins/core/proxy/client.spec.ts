import assert from "node:assert";
import { Blob } from "node:buffer";
import http from "node:http";
import { text } from "node:stream/consumers";
import { ReadableStream, WritableStream } from "node:stream/web";
import util from "node:util";
import {
	DeferredPromise,
	fetch,
	MessageEvent,
	Miniflare,
	ReplaceWorkersTypes,
	Response,
	WebSocketPair,
} from "miniflare";
import { describe, expect, onTestFinished, test } from "vitest";
import { useDispose } from "../../../test-shared";
import type { Fetcher } from "@cloudflare/workers-types/experimental";

// This file tests API proxy edge cases. Cache, D1, Durable Object and R2 tests
// make extensive use of the API proxy, testing their specific special cases.

const nullScript =
	'addEventListener("fetch", (event) => event.respondWith(new Response(null, { status: 404 })));';

describe("ProxyClient", () => {
	test("supports service bindings with WebSockets", async () => {
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
		useDispose(mf);

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
		expect(event.data).toBe("echo:hello");
	});

	test("supports serialising multiple ReadableStreams, Blobs and Files", async () => {
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
		useDispose(mf);

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
		expect(streamTexts).toEqual(["hello", "abc", "123"]);

		// Test serialising single Blob
		const [blobResult] = await IDENTITY.asyncIdentity(
			new Blob(["xyz"], { type: "text/plain" })
		);
		expect(blobResult.type).toBe("text/plain");
		expect(await blobResult.text()).toBe("xyz");

		// Test serialising ReadableStream, Blob and File
		const allResult = await IDENTITY.asyncIdentity(
			new Blob(["no type"]),
			new Blob(["stream"]).stream(),
			new File(["text file"], "text.txt", {
				type: "text/plain",
				lastModified: 1000,
			})
		);
		expect(allResult[0]).not.toBeInstanceOf(File);
		expect(allResult[0]).toBeInstanceOf(Blob);
		expect(await allResult[0].text()).toBe("no type");
		expect(allResult[1]).toBeInstanceOf(ReadableStream);
		expect(await text(allResult[1])).toBe("stream");
		expect(allResult[2]).toBeInstanceOf(File);
		expect(allResult[2].type).toBe("text/plain");
		expect(allResult[2].lastModified).toBe(1000);
		expect(await allResult[2].text()).toBe("text file");
	});
	test("poisons dependent proxies after setOptions()/dispose()", async () => {
		const mf = new Miniflare({ script: nullScript });
		let disposed = false;
		onTestFinished(() => {
			if (!disposed) return mf.dispose();
		});
		let caches = await mf.getCaches();
		let defaultCache = caches.default;
		let namedCache = await caches.open("name");

		const key = "http://localhost";
		await defaultCache.match(key);

		await mf.setOptions({ script: nullScript });

		const error = new Error(
			"Attempted to use poisoned stub. Stubs to runtime objects must be re-created after calling `Miniflare#setOptions()` or `Miniflare#dispose()`."
		);
		expect(() => caches.default).toThrow(error);
		expect(() => defaultCache.match(key)).toThrow(error);
		expect(() => namedCache.match(key)).toThrow(error);

		caches = await mf.getCaches();
		defaultCache = caches.default;
		namedCache = await caches.open("name");

		await defaultCache.match(key);

		await mf.dispose();
		disposed = true;
		expect(() => caches.default).toThrow(error);
		expect(() => defaultCache.match(key)).toThrow(error);
		expect(() => namedCache.match(key)).toThrow(error);
	});
	test("logging proxies provides useful information", async () => {
		const mf = new Miniflare({ script: nullScript });
		useDispose(mf);

		const caches = await mf.getCaches();
		const inspectOpts: util.InspectOptions = { colors: false };
		expect(util.inspect(caches, inspectOpts)).toBe(
			"ProxyStub { name: 'CacheStorage', poisoned: false }"
		);
		expect(util.inspect(caches.open, inspectOpts)).toBe("[Function: open]");
	});

	test("stack traces don't include internal implementation", async () => {
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
		useDispose(mf);

		const ns = await mf.getDurableObjectNamespace("OBJECT");
		const caches = await mf.getCaches();

		function syncUserFunction() {
			try {
				ns.idFromString("bad id");
			} catch (e) {
				assert(hasStack(e));
				expect(e.stack).toMatch(/syncUserFunction/);
				expect(e.stack).not.toMatch(/ProxyStubHandler/);
			}
		}
		syncUserFunction();

		async function asyncUserFunction() {
			try {
				await caches.default.match("bad url");
				throw new Error("Test failed");
			} catch (e) {
				assert(hasStack(e));
				expect(e.stack).toMatch(/asyncUserFunction/);
				expect(e.stack).not.toMatch(/ProxyStubHandler/);
			}
		}
		await asyncUserFunction();
	});
	test("can access ReadableStream property multiple times", async () => {
		const mf = new Miniflare({ script: nullScript, r2Buckets: ["BUCKET"] });
		useDispose(mf);

		const bucket = await mf.getR2Bucket("BUCKET");
		await bucket.put("key", "value");
		const objectBody = await bucket.get("key");
		assert(objectBody != null);
		expect(objectBody.body).not.toBe(null); // 1st access
		expect(await text(objectBody.body)).toBe("value"); // 2nd access
	});
	test("returns empty ReadableStream synchronously", async () => {
		const mf = new Miniflare({ script: nullScript, r2Buckets: ["BUCKET"] });
		useDispose(mf);

		const bucket = await mf.getR2Bucket("BUCKET");
		await bucket.put("key", "");
		const objectBody = await bucket.get("key");
		assert(objectBody != null);
		expect(await text(objectBody.body)).toBe(""); // Synchronous empty stream access
	});
	test("returns multiple ReadableStreams in parallel", async () => {
		const mf = new Miniflare({ script: nullScript, r2Buckets: ["BUCKET"] });
		useDispose(mf);

		const logs: string[] = [];

		const bucket = await mf.getR2Bucket("BUCKET");

		const str = new Array(500000)
			.fill(null)
			.map(() => "test")
			.join("");

		const objectKeys = ["obj-1", "obj-2", "obj-3"];

		for (const objectKey of objectKeys) {
			await bucket.put(objectKey, str);
		}

		await Promise.all(
			objectKeys.map((objectKey) =>
				bucket.get(objectKey).then((obj) => readStream(objectKey, obj?.body))
			)
		);

		async function readStream(objectKey: string, stream?: ReadableStream) {
			logs.push(`[${objectKey}] stream start`);
			if (!stream) return;
			await stream.pipeTo(
				new WritableStream({
					write(_chunk) {
						logs.push(`[${objectKey}] stream chunk`);
					},
					close() {
						logs.push(`[${objectKey}] stream close`);
					},
				})
			);
			logs.push(`[${objectKey}] stream end`);
		}

		for (const objectKey of objectKeys) {
			expect(logs.includes(`[${objectKey}] stream start`)).toBe(true);
			expect(logs.includes(`[${objectKey}] stream chunk`)).toBe(true);
			expect(logs.includes(`[${objectKey}] stream close`)).toBe(true);
			expect(logs.includes(`[${objectKey}] stream end`)).toBe(true);
		}
	});

	test("can `JSON.stringify()` proxies", async () => {
		const mf = new Miniflare({ script: nullScript, r2Buckets: ["BUCKET"] });
		useDispose(mf);

		const bucket = await mf.getR2Bucket("BUCKET");
		const object = await bucket.put("key", "value");
		assert(object !== null);
		expect(Object.getPrototypeOf(object)).toBe(null);
		const plainObject = JSON.parse(JSON.stringify(object));
		expect(plainObject).toEqual({
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
			storageClass: "",
			version: object.version,
		});
	});

	test("ProxyServer: prevents unauthorised access", async () => {
		const mf = new Miniflare({ script: nullScript });
		useDispose(mf);
		const url = await mf.ready;

		// Check validates `Host` header
		const statusPromise = new DeferredPromise<number>();
		const req = http.get(
			url,
			{ setHost: false, headers: { "MF-Op": "GET", Host: "localhost" } },
			(res) => statusPromise.resolve(res.statusCode ?? 0)
		);
		req.on("error", (error) => statusPromise.reject(error));
		expect(await statusPromise).toBe(401);

		// Check validates `MF-Op-Secret` header
		let res = await fetch(url, {
			headers: { "MF-Op": "GET" }, // (missing)
		});
		expect(res.status).toBe(401);
		await res.arrayBuffer(); // (drain)
		res = await fetch(url, {
			headers: { "MF-Op": "GET", "MF-Op-Secret": "aaaa" }, // (too short)
		});
		expect(res.status).toBe(401);
		await res.arrayBuffer(); // (drain)
		res = await fetch(url, {
			headers: { "MF-Op": "GET", "MF-Op-Secret": "a".repeat(32) }, // (wrong)
		});
		expect(res.status).toBe(401);
		await res.arrayBuffer(); // (drain)
	});
});
