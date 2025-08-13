// noinspection TypeScriptValidateJSTypes

import assert from "assert";
import childProcess from "child_process";
import { once } from "events";
import { existsSync } from "fs";
import fs from "fs/promises";
import http from "http";
import { AddressInfo } from "net";
import os from "os";
import path from "path";
import { Writable } from "stream";
import { json, text } from "stream/consumers";
import url from "url";
import util from "util";
import {
	D1Database,
	DurableObjectNamespace,
	Fetcher,
	KVNamespace,
	Queue,
	R2Bucket,
} from "@cloudflare/workers-types/experimental";
import test, { ThrowsExpectation } from "ava";
import {
	_forceColour,
	_transformsForContentEncodingAndContentType,
	createFetchMock,
	DeferredPromise,
	fetch,
	kCurrentWorker,
	MessageEvent,
	Miniflare,
	MiniflareCoreError,
	MiniflareOptions,
	parseWithRootPath,
	PLUGINS,
	ReplaceWorkersTypes,
	Response,
	viewToBuffer,
	Worker_Module,
	WorkerOptions,
} from "miniflare";
import {
	CloseEvent as StandardCloseEvent,
	MessageEvent as StandardMessageEvent,
	WebSocketServer,
} from "ws";
import {
	FIXTURES_PATH,
	TestLog,
	useCwd,
	useServer,
	useTmp,
	utf8Encode,
} from "./test-shared";

// (base64 encoded module containing a single `add(i32, i32): i32` export)
const ADD_WASM_MODULE = Buffer.from(
	"AGFzbQEAAAABBwFgAn9/AX8DAgEABwcBA2FkZAAACgkBBwAgACABagsACgRuYW1lAgMBAAA=",
	"base64"
);

test.serial("Miniflare: validates options", async (t) => {
	// Check empty workers array rejected
	t.throws(() => new Miniflare({ workers: [] }), {
		instanceOf: MiniflareCoreError,
		code: "ERR_NO_WORKERS",
		message: "No workers defined",
	});

	// Check workers with the same name rejected
	t.throws(
		() =>
			new Miniflare({
				workers: [{ script: "" }, { script: "" }],
			}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_DUPLICATE_NAME",
			message: "Multiple workers defined without a `name`",
		}
	);
	t.throws(
		() =>
			new Miniflare({
				workers: [
					{ script: "" },
					{ script: "", name: "a" },
					{ script: "", name: "b" },
					{ script: "", name: "a" },
				],
			}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_DUPLICATE_NAME",
			message: 'Multiple workers defined with the same `name`: "a"',
		}
	);

	// Disable colours for easier to read expectations
	_forceColour(false);
	t.teardown(() => _forceColour());

	// Check throws validation error with incorrect options
	// @ts-expect-error intentionally testing incorrect types
	t.throws(() => new Miniflare({ name: 42, script: "" }), {
		instanceOf: MiniflareCoreError,
		code: "ERR_VALIDATION",
		message: `Unexpected options passed to \`new Miniflare()\` constructor:
{
  name: 42,
        ^ Expected string, received number
  ...,
}`,
	});

	// Check throws validation error with primitive option
	// @ts-expect-error intentionally testing incorrect types
	t.throws(() => new Miniflare("addEventListener(...)"), {
		instanceOf: MiniflareCoreError,
		code: "ERR_VALIDATION",
		message: `Unexpected options passed to \`new Miniflare()\` constructor:
'addEventListener(...)'
^ Expected object, received string`,
	});
});

test("Miniflare: ready returns copy of entry URL", async (t) => {
	const mf = new Miniflare({
		port: 0,
		modules: true,
		script: "",
	});
	t.teardown(() => mf.dispose());

	const url1 = await mf.ready;
	url1.protocol = "ws:";
	const url2 = await mf.ready;
	t.not(url1, url2);
	t.is(url2.protocol, "http:");
});

test("Miniflare: setOptions: can update host/port", async (t) => {
	// Extract loopback port from injected live reload script
	const loopbackPortRegexp = /\/\/ Miniflare Live Reload.+url\.port = (\d+)/s;

	const opts: MiniflareOptions = {
		port: 0,
		inspectorPort: 0,
		liveReload: true,
		script: `addEventListener("fetch", (event) => {
			event.respondWith(new Response("<p>👋</p>", {
				headers: { "Content-Type": "text/html;charset=utf-8" }
			}));
		})`,
	};
	const mf = new Miniflare(opts);
	t.teardown(() => mf.dispose());

	async function getState() {
		const url = await mf.ready;
		const inspectorUrl = await mf.getInspectorURL();
		const res = await mf.dispatchFetch("http://localhost");
		const loopbackPort = loopbackPortRegexp.exec(await res.text())?.[1];
		return { url, inspectorUrl, loopbackPort };
	}

	const state1 = await getState();
	opts.host = "0.0.0.0";
	await mf.setOptions(opts);
	const state2 = await getState();

	// Make sure ports were reused when `port: 0` passed to `setOptions()`
	t.not(state1.url.port, "0");
	t.is(state1.url.port, state2.url.port);
	t.not(state1.inspectorUrl.port, "0");
	t.is(state1.inspectorUrl.port, state2.inspectorUrl.port);

	// Make sure updating the host restarted the loopback server
	t.not(state1.loopbackPort, undefined);
	t.not(state2.loopbackPort, undefined);
	t.not(state1.loopbackPort, state2.loopbackPort);

	// Make sure setting port to `undefined` always gives a new port, but keeps
	// existing loopback server
	opts.port = undefined;
	await mf.setOptions(opts);
	const state3 = await getState();
	t.not(state3.url.port, "0");
	t.not(state1.url.port, state3.url.port);
	t.is(state2.loopbackPort, state3.loopbackPort);
});

const interfaces = os.networkInterfaces();
const localInterface = (interfaces["en0"] ?? interfaces["eth0"])?.find(
	({ family }) => family === "IPv4"
);
(localInterface === undefined ? test.skip : test)(
	"Miniflare: can use local network address as host",
	async (t) => {
		assert(localInterface !== undefined);
		const mf = new Miniflare({
			host: localInterface.address,
			modules: true,
			script: `export default { fetch(request, env) { return env.SERVICE.fetch(request); } }`,
			serviceBindings: {
				SERVICE() {
					return new Response("body");
				},
			},
		});
		t.teardown(() => mf.dispose());

		let res = await mf.dispatchFetch("https://example.com");
		t.is(await res.text(), "body");

		const worker = await mf.getWorker();
		res = await worker.fetch("https://example.com");
		t.is(await res.text(), "body");
	}
);
test("Miniflare: can use IPv6 loopback as host", async (t) => {
	const mf = new Miniflare({
		host: "::1",
		modules: true,
		script: `export default { fetch(request, env) { return env.SERVICE.fetch(request); } }`,
		serviceBindings: {
			SERVICE() {
				return new Response("body");
			},
		},
	});
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("https://example.com");
	t.is(await res.text(), "body");

	const worker = await mf.getWorker();
	res = await worker.fetch("https://example.com");
	t.is(await res.text(), "body");
});

test("Miniflare: routes to multiple workers with fallback", async (t) => {
	const opts: MiniflareOptions = {
		workers: [
			{
				name: "a",
				routes: ["*/api"],
				script: `addEventListener("fetch", (event) => {
					event.respondWith(new Response("a"));
				})`,
			},
			{
				name: "b",
				routes: ["*/api/*"], // Less specific than "a"'s
				script: `addEventListener("fetch", (event) => {
					event.respondWith(new Response("b"));
				})`,
			},
		],
	};
	const mf = new Miniflare(opts);
	t.teardown(() => mf.dispose());

	// Check "a"'s more specific route checked first
	let res = await mf.dispatchFetch("http://localhost/api");
	t.is(await res.text(), "a");

	// Check "b" still accessible
	res = await mf.dispatchFetch("http://localhost/api/2");
	t.is(await res.text(), "b");

	// Check fallback to first
	res = await mf.dispatchFetch("http://localhost/notapi");
	t.is(await res.text(), "a");
});

test("Miniflare: custom service using Content-Encoding header", async (t) => {
	const testBody = "x".repeat(100);
	const { http } = await useServer(t, (req, res) => {
		const testEncoding = req.headers["x-test-encoding"]?.toString();
		const contentType = "text/html"; // known content-type that will always be compressed
		const encoders = _transformsForContentEncodingAndContentType(
			testEncoding,
			contentType
		);
		let initialStream: Writable = res;
		for (let i = encoders.length - 1; i >= 0; i--) {
			encoders[i].pipe(initialStream);
			initialStream = encoders[i];
		}
		res.writeHead(200, {
			"Content-Encoding": testEncoding,
			"Content-Type": contentType,
		});
		initialStream.write(testBody);
		initialStream.end();
	});
	const mf = new Miniflare({
		compatibilityFlags: ["brotli_content_encoding"],
		script: `addEventListener("fetch", (event) => {
			event.respondWith(CUSTOM.fetch(event.request));
		})`,
		serviceBindings: {
			CUSTOM(request) {
				return fetch(http, request);
			},
		},
	});
	t.teardown(() => mf.dispose());

	const test = async (encoding: string) => {
		const res = await mf.dispatchFetch("http://localhost", {
			headers: {
				"Accept-Encoding": encoding,
				"X-Test-Encoding": encoding,
			},
		});
		t.is(await res.text(), testBody, encoding);
		// This header is mostly just for this test -- but is an indication for anyone who wants to know if the response _was_ compressed
		t.is(
			res.headers.get("MF-Content-Encoding"),
			encoding,
			`Expected the response, before decoding, to be encoded as ${encoding}`
		);
		// Ensure this header has been removed -- undici.fetch has already decoded (decompressed) the response
		t.is(
			res.headers.get("Content-Encoding"),
			null,
			"Expected Content-Encoding header to be removed"
		);
	};

	await test("gzip");
	await test("deflate");
	await test("br");
	// `undici`'s `fetch()` is currently broken when `Content-Encoding` specifies
	// multiple encodings. Once https://github.com/nodejs/undici/pull/2159 is
	// released, we can re-enable this test.
	// TODO(soon): re-enable this test
	// await test("deflate, gzip");
});

test("Miniflare: negotiates acceptable encoding", async (t) => {
	const testBody = "x".repeat(100);
	const mf = new Miniflare({
		bindings: { TEST_BODY: testBody },
		compatibilityFlags: ["brotli_content_encoding"],
		modules: true,
		script: `
		export default {
			async fetch(request, env, ctx) {
				const url = new URL(request.url);

				switch (url.pathname) {
					case "/": {
						return Response.json({
							AcceptEncoding: request.headers.get("Accept-Encoding"),
							clientAcceptEncoding: request.cf.clientAcceptEncoding,
						});
					}

					// Content-Encoding routes
					case "/gzip": {
						return new Response(env.TEST_BODY, {
							headers: {
								"Content-Encoding": "gzip",
							}
						});
					}
					case "/br": {
						return new Response(env.TEST_BODY, {
							headers: {
								"Content-Encoding": "br",
							}
						});
					}
					case "/deflate": {
						// workerd doesn't automatically encode "deflate"
						const response = new Response(env.TEST_BODY);
						const compressionStream = new CompressionStream("deflate");
						const compressedBody = response.body.pipeThrough(compressionStream);
						return new Response(compressedBody, {
							encodeBody: "manual",
							headers: {
								"Content-Encoding": "deflate",
							},
						});
					}

					// Content-Type routes
					case "/default-compressed": {
						return new Response(env.TEST_BODY, {
							headers: {
								"Content-Type": "text/html",
							}
						});
					}
					case "/default-uncompressed": {
						return new Response(env.TEST_BODY, {
							headers: {
								"Content-Type": "text/event-stream",
							}
						});
					}

					default: {
						return new Response(null, { status: 404 });
					}
				}
			},
		};
		`,
	});
	t.teardown(() => mf.dispose());

	// Using `fetch()` directly to simulate eyeball
	const url = await mf.ready;
	const gzipUrl = new URL("/gzip", url);
	const brUrl = new URL("/br", url);
	const deflateUrl = new URL("/deflate", url);
	const defaultCompressedUrl = new URL("/default-compressed", url);
	const defaultUncompressedUrl = new URL("/default-uncompressed", url);

	// https://github.com/cloudflare/workers-sdk/issues/5246
	let res = await fetch(url, {
		headers: { "Accept-Encoding": "hello" },
	});
	t.deepEqual(await res.json(), {
		AcceptEncoding: "br, gzip",
		clientAcceptEncoding: "hello",
	});

	// Check all encodings supported
	res = await fetch(gzipUrl);
	t.is(await res.text(), testBody);
	res = await fetch(brUrl);
	t.is(await res.text(), testBody);
	res = await fetch(deflateUrl);
	t.is(await res.text(), testBody);

	// Check with `Accept-Encoding: gzip`
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "gzip" } });
	t.is(res.headers.get("Content-Encoding"), "gzip");
	t.is(await res.text(), testBody);
	res = await fetch(brUrl, { headers: { "Accept-Encoding": "gzip" } });
	t.is(res.headers.get("Content-Encoding"), "gzip");
	t.is(await res.text(), testBody);
	// "deflate" isn't an accepted encoding inside Workers, so returned as is
	res = await fetch(deflateUrl, { headers: { "Accept-Encoding": "gzip" } });
	t.is(res.headers.get("Content-Encoding"), "deflate");
	t.is(await res.text(), testBody);

	// Check with `Accept-Encoding: br`
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "br" } });
	t.is(res.headers.get("Content-Encoding"), "br");
	t.is(await res.text(), testBody);
	res = await fetch(brUrl, { headers: { "Accept-Encoding": "br" } });
	t.is(res.headers.get("Content-Encoding"), "br");
	t.is(await res.text(), testBody);
	// "deflate" isn't an accepted encoding inside Workers, so returned as is
	res = await fetch(deflateUrl, { headers: { "Accept-Encoding": "br" } });
	t.is(res.headers.get("Content-Encoding"), "deflate");
	t.is(await res.text(), testBody);

	// Check with mixed `Accept-Encoding`
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "gzip, br" } });
	t.is(res.headers.get("Content-Encoding"), "gzip");
	t.is(await res.text(), testBody);
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "br, gzip" } });
	t.is(res.headers.get("Content-Encoding"), "br");
	t.is(await res.text(), testBody);
	res = await fetch(gzipUrl, {
		headers: { "Accept-Encoding": "br;q=0.5, gzip" },
	});
	t.is(res.headers.get("Content-Encoding"), "gzip");
	t.is(await res.text(), testBody);

	// Check empty `Accept-Encoding`
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "" } });
	t.is(res.headers.get("Content-Encoding"), "gzip");
	t.is(await res.text(), testBody);

	// Check identity encoding
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "identity" } });
	t.is(res.headers.get("Content-Encoding"), null);
	t.is(await res.text(), testBody);
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "*" } });
	t.is(res.headers.get("Content-Encoding"), null);
	t.is(await res.text(), testBody);
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "zstd, *" } });
	t.is(res.headers.get("Content-Encoding"), null);
	t.is(await res.text(), testBody);
	res = await fetch(gzipUrl, {
		headers: { "Accept-Encoding": "zstd, identity;q=0" },
	});
	t.is(res.status, 415);
	t.is(res.headers.get("Accept-Encoding"), "br, gzip");
	t.is(await res.text(), "Unsupported Media Type");
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "zstd, *;q=0" } });
	t.is(res.status, 415);
	t.is(res.headers.get("Accept-Encoding"), "br, gzip");
	t.is(await res.text(), "Unsupported Media Type");

	// Check malformed `Accept-Encoding`
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": ",(,br,,,q=," } });
	t.is(res.headers.get("Content-Encoding"), "br");
	t.is(await res.text(), testBody);

	// Check `Content-Type: text/html` is compressed (FL always compresses html)
	res = await fetch(defaultCompressedUrl);
	t.is(res.headers.get("Content-Type"), "text/html");
	t.is(res.headers.get("Content-Encoding"), "gzip");
	t.is(await res.text(), testBody);

	// Check `Content-Type: text/event-stream` is not compressed (FL does not compress this mime type)
	res = await fetch(defaultUncompressedUrl);
	t.is(res.headers.get("Content-Type"), "text/event-stream");
	t.is(res.headers.get("Content-Encoding"), null);
	t.is(await res.text(), testBody);
});

test("Miniflare: custom service using Set-Cookie header", async (t) => {
	const testCookies = [
		"key1=value1; Max-Age=3600",
		"key2=value2; Domain=example.com; Secure",
	];
	const { http } = await useServer(t, (req, res) => {
		res.writeHead(200, { "Set-Cookie": testCookies });
		res.end();
	});
	const mf = new Miniflare({
		modules: true,
		script: `export default {
            async fetch(request, env, ctx) {
				const res = await env.CUSTOM.fetch(request);
				return Response.json(res.headers.getSetCookie());
            }
	    }`,
		serviceBindings: {
			CUSTOM(request) {
				return fetch(http, request);
			},
		},
		// Enable `Headers#getSetCookie()`:
		// https://github.com/cloudflare/workerd/blob/14b54764609c263ea36ab862bb8bf512f9b1387b/src/workerd/io/compatibility-date.capnp#L273-L278
		compatibilityDate: "2023-03-01",
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://localhost");
	t.deepEqual(await res.json(), testCookies);
});

test("Miniflare: web socket kitchen sink", async (t) => {
	// Create deferred promises for asserting asynchronous event results
	const clientEventPromise = new DeferredPromise<MessageEvent>();
	const serverMessageEventPromise = new DeferredPromise<StandardMessageEvent>();
	const serverCloseEventPromise = new DeferredPromise<StandardCloseEvent>();

	// Create WebSocket origin server
	const server = http.createServer();
	const wss = new WebSocketServer({
		server,
		handleProtocols(protocols) {
			t.deepEqual(protocols, new Set(["protocol1", "protocol2"]));
			return "protocol2";
		},
	});
	wss.on("connection", (ws, req) => {
		// Testing receiving additional headers sent from upgrade request
		t.is(req.headers["user-agent"], "Test");

		ws.send("hello from server");
		ws.addEventListener("message", serverMessageEventPromise.resolve);
		ws.addEventListener("close", serverCloseEventPromise.resolve);
	});
	wss.on("headers", (headers) => {
		headers.push("Set-Cookie: key=value");
	});
	const port = await new Promise<number>((resolve) => {
		server.listen(0, () => {
			t.teardown(() => server.close());
			resolve((server.address() as AddressInfo).port);
		});
	});

	// Create Miniflare instance with WebSocket worker and custom service binding
	// fetching from WebSocket origin server
	const mf = new Miniflare({
		script: `addEventListener("fetch", (event) => {
			event.respondWith(CUSTOM.fetch(event.request));
		})`,
		serviceBindings: {
			// Testing loopback server WebSocket coupling
			CUSTOM(request) {
				// Testing dispatchFetch custom cf injection
				t.is(request.cf?.country, "MF");
				// Testing dispatchFetch injects default cf values
				t.is(request.cf?.regionCode, "TX");
				t.is(request.headers.get("MF-Custom-Service"), null);
				// Testing WebSocket-upgrading fetch
				return fetch(`http://localhost:${port}`, request);
			},
		},
	});
	t.teardown(() => mf.dispose());

	// Testing dispatchFetch WebSocket coupling
	const res = await mf.dispatchFetch("http://localhost", {
		headers: {
			Upgrade: "websocket",
			"User-Agent": "Test",
			"Sec-WebSocket-Protocol": "protocol1, protocol2",
		},
		cf: { country: "MF" },
	});

	assert(res.webSocket);
	res.webSocket.addEventListener("message", clientEventPromise.resolve);
	res.webSocket.accept();
	res.webSocket.send("hello from client");
	res.webSocket.close(1000, "Test Closure");
	// Test receiving additional headers from upgrade response
	t.is(res.headers.get("Set-Cookie"), "key=value");
	t.is(res.headers.get("Sec-WebSocket-Protocol"), "protocol2");

	// Check event results
	const clientEvent = await clientEventPromise;
	const serverMessageEvent = await serverMessageEventPromise;
	const serverCloseEvent = await serverCloseEventPromise;
	t.is(clientEvent.data, "hello from server");
	t.is(serverMessageEvent.data, "hello from client");
	t.is(serverCloseEvent.code, 1000);
	t.is(serverCloseEvent.reason, "Test Closure");
});

test("Miniflare: custom service binding to another Miniflare instance", async (t) => {
	const mfOther = new Miniflare({
		modules: true,
		script: `export default {
			async fetch(request) {
				const { method, url } = request;
				const body = request.body && await request.text();
				return Response.json({ method, url, body });
			}
		}`,
	});
	t.teardown(() => mfOther.dispose());

	const mf = new Miniflare({
		script: `addEventListener("fetch", (event) => {
			event.respondWith(CUSTOM.fetch(event.request));
		})`,
		serviceBindings: {
			async CUSTOM(request) {
				// Check internal keys removed (e.g. `MF-Custom-Service`, `MF-Original-URL`)
				// https://github.com/cloudflare/miniflare/issues/475
				const keys = [...request.headers.keys()];
				t.deepEqual(
					keys.filter((key) => key.toLowerCase().startsWith("mf-")),
					[]
				);

				return await mfOther.dispatchFetch(request);
			},
		},
	});
	t.teardown(() => mf.dispose());

	// Checking URL (including protocol/host) and body preserved through
	// `dispatchFetch()` and custom service bindings
	let res = await mf.dispatchFetch("https://custom1.mf/a?key=value");
	t.deepEqual(await res.json(), {
		method: "GET",
		url: "https://custom1.mf/a?key=value",
		body: null,
	});

	res = await mf.dispatchFetch("https://custom2.mf/b", {
		method: "POST",
		body: "body",
	});
	t.deepEqual(await res.json(), {
		method: "POST",
		url: "https://custom2.mf/b",
		body: "body",
	});

	// https://github.com/cloudflare/miniflare/issues/476
	res = await mf.dispatchFetch("https://custom3.mf/c", { method: "DELETE" });
	t.deepEqual(await res.json(), {
		method: "DELETE",
		url: "https://custom3.mf/c",
		body: null,
	});
});
test("Miniflare: service binding to current worker", async (t) => {
	const mf = new Miniflare({
		serviceBindings: { SELF: kCurrentWorker },
		modules: true,
		script: `export default {
			async fetch(request, env) {
				const { pathname } = new URL(request.url);
				if (pathname === "/callback") return new Response("callback");
				const response = await env.SELF.fetch("http://placeholder/callback");
				const text = await response.text();
				return new Response("body:" + text);
			}
		}`,
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "body:callback");
});
test("Miniflare: service binding to network", async (t) => {
	const { http } = await useServer(t, (req, res) => res.end("network"));
	const mf = new Miniflare({
		serviceBindings: { NETWORK: { network: { allow: ["private"] } } },
		modules: true,
		script: `export default {
			fetch(request, env) { return env.NETWORK.fetch(request); }
		}`,
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch(http);
	t.is(await res.text(), "network");
});
test("Miniflare: service binding to external server", async (t) => {
	const { http } = await useServer(t, (req, res) => res.end("external"));
	const mf = new Miniflare({
		serviceBindings: {
			EXTERNAL: { external: { address: http.host, http: {} } },
		},
		modules: true,
		script: `export default {
			fetch(request, env) { return env.EXTERNAL.fetch(request); }
		}`,
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("https://example.com");
	t.is(await res.text(), "external");
});
test("Miniflare: service binding to disk", async (t) => {
	const tmp = await useTmp(t);
	const testPath = path.join(tmp, "test.txt");
	await fs.writeFile(testPath, "👋");
	const mf = new Miniflare({
		serviceBindings: {
			DISK: { disk: { path: tmp, writable: true } },
		},
		modules: true,
		script: `export default {
			fetch(request, env) { return env.DISK.fetch(request); }
		}`,
	});
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("https://example.com/test.txt");
	t.is(await res.text(), "👋");

	res = await mf.dispatchFetch("https://example.com/test.txt", {
		method: "PUT",
		body: "✏️",
	});
	t.is(res.status, 204);
	t.is(await fs.readFile(testPath, "utf8"), "✏️");
});
test("Miniflare: service binding to named entrypoint", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				name: "a",
				serviceBindings: {
					A_RPC_SERVICE: { name: kCurrentWorker, entrypoint: "RpcEntrypoint" },
					A_NAMED_SERVICE: { name: "a", entrypoint: "namedEntrypoint" },
					B_NAMED_SERVICE: { name: "b", entrypoint: "anotherNamedEntrypoint" },
				},
				compatibilityFlags: ["rpc"],
				modules: true,
				script: `
				import { WorkerEntrypoint } from "cloudflare:workers";
				export class RpcEntrypoint extends WorkerEntrypoint {
					ping() { return "a:rpc:pong"; }
				}

				export const namedEntrypoint = {
					fetch(request, env, ctx) { return new Response("a:named:pong"); }
				};

				export default {
					async fetch(request, env) {
						const aRpc = await env.A_RPC_SERVICE.ping();
						const aNamed = await (await env.A_NAMED_SERVICE.fetch("http://placeholder")).text();
						const bNamed = await (await env.B_NAMED_SERVICE.fetch("http://placeholder")).text();
						return Response.json({ aRpc, aNamed, bNamed });
					}
				}
				`,
			},
			{
				name: "b",
				modules: true,
				script: `
				export const anotherNamedEntrypoint = {
					fetch(request, env, ctx) { return new Response("b:named:pong"); }
				};
				`,
			},
		],
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://placeholder");
	t.deepEqual(await res.json(), {
		aRpc: "a:rpc:pong",
		aNamed: "a:named:pong",
		bNamed: "b:named:pong",
	});
});

test("Miniflare: service binding to named entrypoint that implements a method returning a plain object", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				name: "a",
				serviceBindings: {
					RPC_SERVICE: { name: "b", entrypoint: "RpcEntrypoint" },
				},
				compatibilityFlags: ["rpc"],
				modules: true,
				script: `
				export default {
					async fetch(request, env) {
						const obj = await env.RPC_SERVICE.getObject();
						return Response.json({ obj });
					}
				}
				`,
			},
			{
				name: "b",
				modules: true,
				script: `
					import { WorkerEntrypoint } from "cloudflare:workers";
					export class RpcEntrypoint extends WorkerEntrypoint {
						getObject() {
							return {
								isPlainObject: true,
								value: 123,
							}
						}
					}
				`,
			},
		],
	});
	t.teardown(() => mf.dispose());

	const bindings = await mf.getBindings<{ RPC_SERVICE: any }>();
	const o = await bindings.RPC_SERVICE.getObject();
	t.deepEqual(o.isPlainObject, true);
	t.deepEqual(o.value, 123);
});

test("Miniflare: service binding to named entrypoint that implements a method returning an RpcTarget instance", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				name: "a",
				serviceBindings: {
					RPC_SERVICE: { name: "b", entrypoint: "RpcEntrypoint" },
				},
				compatibilityFlags: ["rpc"],
				modules: true,
				script: `
				export default {
					async fetch(request, env) {
						const rpcTarget = await env.RPC_SERVICE.getRpcTarget();
						return Response.json(rpcTarget.id);
					}
				}
				`,
			},
			{
				name: "b",
				modules: true,
				script: `
					import { WorkerEntrypoint, RpcTarget } from "cloudflare:workers";

					export class RpcEntrypoint extends WorkerEntrypoint {
						getRpcTarget() {
							return new SubService("test-id");
						}
					}

					class SubService extends RpcTarget {
						#id

						constructor(id) {
							super()
							this.#id = id
						}

						get id() {
							return this.#id
						}
					}
				`,
			},
		],
	});
	t.teardown(() => mf.dispose());

	const bindings = await mf.getBindings<{ RPC_SERVICE: any }>();
	const rpcTarget = await bindings.RPC_SERVICE.getRpcTarget();
	t.deepEqual(rpcTarget.id, "test-id");
});

test("Miniflare: tail consumer called", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				name: "a",
				tails: ["b"],
				compatibilityDate: "2025-04-28",
				modules: true,
				script: `

				export default {
					async fetch(request, env) {
						if(request.url.includes("b")) { return env.B.fetch(request)}
						console.log("log event")

						return new Response("hello from a");
					}
				}
				`,
				serviceBindings: {
					B: "b",
				},
			},
			{
				name: "b",
				modules: true,
				compatibilityDate: "2025-04-28",

				script: `
				let event;
				export default {
					fetch() {return Response.json(event)},
					tail(e) {event = e }
				};
				`,
			},
		],
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://placeholder");
	t.deepEqual(await res.text(), "hello from a");
	t.deepEqual(
		(
			(await (await mf.dispatchFetch("http://placeholder/b")).json()) as {
				logs: { message: string[] }[];
			}[]
		)[0].logs[0].message,
		["log event"]
	);
});

test("Miniflare: custom outbound service", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				name: "a",
				modules: true,
				script: `export default {
					async fetch() {
						const res1 = await (await fetch("https://example.com/1")).text();
						const res2 = await (await fetch("https://example.com/2")).text();
						return Response.json({ res1, res2 });
					}
				}`,
				outboundService: "b",
			},
			{
				name: "b",
				modules: true,
				script: `export default {
					async fetch(request, env) {
						if (request.url === "https://example.com/1") {
							return new Response("one");
						} else {
							return fetch(request);
						}
					}
				}`,
				outboundService(request) {
					return new Response(`fallback:${request.url}`);
				},
			},
		],
	});
	t.teardown(() => mf.dispose());
	const res = await mf.dispatchFetch("http://localhost");
	t.deepEqual(await res.json(), {
		res1: "one",
		res2: "fallback:https://example.com/2",
	});
});

test("Miniflare: can send GET request with body", async (t) => {
	// https://github.com/cloudflare/workerd/issues/1122
	const mf = new Miniflare({
		compatibilityDate: "2023-08-01",
		modules: true,
		script: `export default {
			async fetch(request) {
				return Response.json({
					cf: request.cf,
					contentLength: request.headers.get("Content-Length"),
					hasBody: request.body !== null,
				});
			}
		}`,
		cf: { key: "value" },
	});
	t.teardown(() => mf.dispose());

	// Can't use `dispatchFetch()` here as `fetch()` prohibits `GET` requests
	// with bodies/`Content-Length: 0` headers
	const url = await mf.ready;
	function get(opts: http.RequestOptions = {}): Promise<http.IncomingMessage> {
		return new Promise((resolve, reject) => {
			http.get(url, opts, resolve).on("error", reject);
		});
	}

	let res = await get();
	t.deepEqual(await json(res), {
		cf: { key: "value", clientAcceptEncoding: "" },
		contentLength: null,
		hasBody: false,
	});

	res = await get({ headers: { "content-length": "0" } });
	t.deepEqual(await json(res), {
		cf: { key: "value", clientAcceptEncoding: "" },
		contentLength: "0",
		hasBody: true,
	});
});

test("Miniflare: handles redirect responses", async (t) => {
	// https://github.com/cloudflare/workers-sdk/issues/5018

	const { http } = await useServer(t, (req, res) => {
		// Check no special headers set
		const headerKeys = Object.keys(req.headers);
		t.deepEqual(
			headerKeys.filter((key) => key.toLowerCase().startsWith("mf-")),
			[]
		);

		const { pathname } = new URL(req.url ?? "", "http://placeholder");
		if (pathname === "/ping") {
			res.end("pong");
		} else if (pathname === "/redirect-back") {
			res.writeHead(302, { Location: "https://custom.mf/external-redirected" });
			res.end();
		} else {
			res.writeHead(404);
			res.end("Not Found");
		}
	});

	const mf = new Miniflare({
		bindings: { EXTERNAL_URL: http.href },
		compatibilityDate: "2024-01-01",
		modules: true,
		script: `export default {
			async fetch(request, env) {
				const url = new URL(request.url);
						const externalUrl = new URL(env.EXTERNAL_URL);
				if (url.pathname === "/redirect-relative") {
					return new Response(null, { status: 302, headers: { Location: "/relative-redirected" } });
				} else if (url.pathname === "/redirect-absolute") {
					url.pathname = "/absolute-redirected";
					return Response.redirect(url, 302);
				} else if (url.pathname === "/redirect-external") {
					externalUrl.pathname = "/ping";
					return Response.redirect(externalUrl, 302);
				} else if (url.pathname === "/redirect-external-and-back") {
							externalUrl.pathname = "/redirect-back";
					return Response.redirect(externalUrl, 302);
				} else {
					return new Response("end:" + url.href);
				}
			}
	}`,
	});
	t.teardown(() => mf.dispose());

	// Check relative redirect
	let res = await mf.dispatchFetch("https://custom.mf/redirect-relative", {
		redirect: "manual",
	});
	t.is(res.status, 302);
	t.is(res.headers.get("Location"), "/relative-redirected");
	await res.arrayBuffer(); // (drain)

	res = await mf.dispatchFetch("https://custom.mf/redirect-relative");
	t.is(res.status, 200);
	t.is(await res.text(), "end:https://custom.mf/relative-redirected");

	// Check absolute redirect to same origin
	res = await mf.dispatchFetch("https://custom.mf/redirect-absolute", {
		redirect: "manual",
	});
	t.is(res.status, 302);
	t.is(res.headers.get("Location"), "https://custom.mf/absolute-redirected");
	await res.arrayBuffer(); // (drain)

	res = await mf.dispatchFetch("https://custom.mf/redirect-absolute");
	t.is(res.status, 200);
	t.is(await res.text(), "end:https://custom.mf/absolute-redirected");

	// Check absolute redirect to external origin
	res = await mf.dispatchFetch("https://custom.mf/redirect-external", {
		redirect: "manual",
	});
	t.is(res.status, 302);
	t.is(res.headers.get("Location"), new URL("/ping", http).href);
	await res.arrayBuffer(); // (drain)

	res = await mf.dispatchFetch("https://custom.mf/redirect-external");
	t.is(res.status, 200);
	t.is(await res.text(), "pong");

	// Check absolute redirect to external origin, then redirect back to initial
	res = await mf.dispatchFetch("https://custom.mf/redirect-external-and-back", {
		redirect: "manual",
	});
	t.is(res.status, 302);
	t.is(res.headers.get("Location"), new URL("/redirect-back", http).href);
	await res.arrayBuffer(); // (drain)

	res = await mf.dispatchFetch("https://custom.mf/redirect-external-and-back");
	t.is(res.status, 200);
	// External server redirects back to worker running in `workerd`
	t.is(await res.text(), "end:https://custom.mf/external-redirected");
});

test("Miniflare: fetch mocking", async (t) => {
	const fetchMock = createFetchMock();
	fetchMock.disableNetConnect();
	const origin = fetchMock.get("https://example.com");
	origin.intercept({ method: "GET", path: "/" }).reply(200, "Mocked response!");

	const mfOptions: MiniflareOptions = {
		modules: true,
		script: `export default {
			async fetch() {
				return fetch("https://example.com/");
			}
		}`,
		fetchMock,
	};
	const resultOptions = {} as MiniflareOptions;

	// Verify that options with `fetchMock` can be parsed first before passing to Miniflare
	// Regression test for https://github.com/cloudflare/workers-sdk/issues/5486
	for (const plugin of Object.values(PLUGINS)) {
		Object.assign(
			resultOptions,
			parseWithRootPath("", plugin.options, mfOptions)
		);
	}

	const mf = new Miniflare(resultOptions);
	t.teardown(() => mf.dispose());
	const res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "Mocked response!");

	// Check `outboundService`and `fetchMock` mutually exclusive
	await t.throwsAsync(
		mf.setOptions({
			script: "",
			fetchMock,
			outboundService: "",
		}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_MULTIPLE_OUTBOUNDS",
			message:
				"Only one of `outboundService` or `fetchMock` may be specified per worker",
		}
	);
});
test("Miniflare: custom upstream as origin (with colons)", async (t) => {
	const upstream = await useServer(t, (req, res) => {
		res.end(`upstream: ${new URL(req.url ?? "", "http://upstream")}`);
	});
	const mf = new Miniflare({
		upstream: new URL("/extra:extra/", upstream.http.toString()).toString(),
		modules: true,
		script: `export default {
			fetch(request) {
				return fetch(request);
			}
		}`,
	});
	t.teardown(() => mf.dispose());
	// Check rewrites protocol, hostname, and port, but keeps pathname and query
	const res = await mf.dispatchFetch("https://random:0/path:path?a=1");
	t.is(await res.text(), "upstream: http://upstream/extra:extra/path:path?a=1");
});
test("Miniflare: custom upstream as origin", async (t) => {
	const upstream = await useServer(t, (req, res) => {
		res.end(`upstream: ${new URL(req.url ?? "", "http://upstream")}`);
	});
	const mf = new Miniflare({
		upstream: new URL("/extra/", upstream.http.toString()).toString(),
		modules: true,
		script: `export default {
			async fetch(request) {
				const resp = await (await fetch(request)).text();
						return Response.json({
							resp,
							host: request.headers.get("Host")
						});
			}
		}`,
	});
	t.teardown(() => mf.dispose());
	// Check rewrites protocol, hostname, and port, but keeps pathname and query
	const res = await mf.dispatchFetch("https://random:0/path?a=1");
	t.deepEqual(await res.json(), {
		resp: "upstream: http://upstream/extra/path?a=1",
		host: upstream.http.host,
	});
});
test("Miniflare: set origin to original URL if proxy shared secret matches", async (t) => {
	const mf = new Miniflare({
		unsafeProxySharedSecret: "SOME_PROXY_SHARED_SECRET_VALUE",
		modules: true,
		script: `export default {
			async fetch(request) {
				return Response.json({
					host: request.headers.get("Host")
				});
			}
		}`,
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("https://random:0/path?a=1", {
		headers: { "MF-Proxy-Shared-Secret": "SOME_PROXY_SHARED_SECRET_VALUE" },
	});
	t.deepEqual(await res.json(), {
		host: "random:0",
	});
});
test("Miniflare: keep origin as listening host if proxy shared secret not provided", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: `export default {
	  		async fetch(request) {
				return Response.json({
					host: request.headers.get("Host")
				});
			}
		}`,
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("https://random:0/path?a=1");
	t.deepEqual(await res.json(), {
		host: (await mf.ready).host,
	});
});
test("Miniflare: 400 error on proxy shared secret header when not configured", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: `export default {
	  		async fetch(request) {
				return Response.json({
					host: request.headers.get("Host")
				});
			}
		}`,
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("https://random:0/path?a=1", {
		headers: { "MF-Proxy-Shared-Secret": "SOME_PROXY_SHARED_SECRET_VALUE" },
	});
	t.is(res.status, 400);
	t.is(
		await res.text(),
		"Disallowed header in request: MF-Proxy-Shared-Secret=SOME_PROXY_SHARED_SECRET_VALUE"
	);
});
test("Miniflare: 400 error on proxy shared secret header mismatch with configuration", async (t) => {
	const mf = new Miniflare({
		unsafeProxySharedSecret: "SOME_PROXY_SHARED_SECRET_VALUE",
		modules: true,
		script: `export default {
	  		async fetch(request) {
				return Response.json({
					host: request.headers.get("Host")
				});
	  		}
		}`,
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("https://random:0/path?a=1", {
		headers: { "MF-Proxy-Shared-Secret": "BAD_PROXY_SHARED_SECRET" },
	});
	t.is(res.status, 400);
	t.is(
		await res.text(),
		"Disallowed header in request: MF-Proxy-Shared-Secret=BAD_PROXY_SHARED_SECRET"
	);
});

test("Miniflare: `node:`, `cloudflare:` and `workerd:` modules", async (t) => {
	const mf = new Miniflare({
		modules: true,
		compatibilityFlags: ["nodejs_compat", "rtti_api"],
		scriptPath: "index.mjs",
		script: `
			import assert from "node:assert";
			import { Buffer } from "node:buffer";
			import { connect } from "cloudflare:sockets";
			import rtti from "workerd:rtti";
			export default {
				fetch() {
					assert.strictEqual(typeof connect, "function");
					assert.strictEqual(typeof rtti, "object");
					return new Response(Buffer.from("test").toString("base64"))
				}
			}
		`,
	});
	t.teardown(() => mf.dispose());
	const res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "dGVzdA==");
});

test("Miniflare: modules in sub-directories", async (t) => {
	const mf = new Miniflare({
		modules: [
			{
				type: "ESModule",
				path: "index.js",
				contents: `import { b } from "./sub1/index.js"; export default { fetch() { return new Response(String(b + 3)); } }`,
			},
			{
				type: "ESModule",
				path: "sub1/index.js",
				contents: `import { c } from "./sub2/index.js"; export const b = c + 20;`,
			},
			{
				type: "ESModule",
				path: "sub1/sub2/index.js",
				contents: `export const c = 100;`,
			},
		],
	});
	t.teardown(() => mf.dispose());
	const res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "123");
});

test("Miniflare: python modules", async (t) => {
	const mf = new Miniflare({
		modules: [
			{
				type: "PythonModule",
				path: "index.py",
				contents:
					"from test_module import add; from workers import Response, WorkerEntrypoint;\nclass Default(WorkerEntrypoint):\n  def fetch(self, request):\n    return Response(str(add(2,2)))",
			},
			{
				type: "PythonModule",
				path: "test_module.py",
				contents: `def add(a, b):\n  return a + b`,
			},
		],
		compatibilityFlags: ["python_workers", "python_no_global_handlers"],
	});
	t.teardown(() => mf.dispose());
	const res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "4");
});

test("Miniflare: HTTPS fetches using browser CA certificates", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: `export default {
			fetch() {
				return fetch("https://workers.cloudflare.com/cf.json");
			}
		}`,
	});
	t.teardown(() => mf.dispose());
	const res = await mf.dispatchFetch("http://localhost");
	t.true(res.ok);
	await res.arrayBuffer(); // (drain)
});

test("Miniflare: accepts https requests", async (t) => {
	const log = new TestLog(t);

	const mf = new Miniflare({
		log,
		modules: true,
		https: true,
		script: `export default {
			fetch() {
				return new Response("Hello world");
			}
		}`,
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("https://localhost");
	t.true(res.ok);
	await res.arrayBuffer(); // (drain)

	t.assert(log.logs[0][1].startsWith("Ready on https://"));
});

// Regression test for https://github.com/cloudflare/workers-sdk/issues/9357
test("Miniflare: throws error messages that reflect the actual issue", async (t) => {
	const log = new TestLog(t);

	const mf = new Miniflare({
		log,
		modules: true,
		https: true,
		script: `export default {
			async fetch(request, env, ctx) {
				Object.defineProperty("not an object", "node", "");

				return new Response('Hello World!');
			},
		}`,
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("https://localhost");
	t.regex(
		await res.text(),
		/TypeError: Object\.defineProperty called on non-object/
	);
});

test("Miniflare: manually triggered scheduled events", async (t) => {
	const log = new TestLog(t);

	const mf = new Miniflare({
		log,
		modules: true,
		script: `
			let scheduledRun = false;
			export default {
				fetch() {
					return new Response(scheduledRun);
				},
				scheduled() {
					scheduledRun = true;
				}
			}`,
		unsafeTriggerHandlers: true,
	});
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "false");

	res = await mf.dispatchFetch("http://localhost/cdn-cgi/handler/scheduled");
	t.is(await res.text(), "ok");

	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "true");
});

test("Miniflare: manually triggered email handler - valid email", async (t) => {
	const log = new TestLog(t);

	const mf = new Miniflare({
		log,
		modules: true,
		script: `
			let receivedEmail = false;
			export default {
				fetch() {
					return new Response(receivedEmail);
				},
				email(emailMessage) {
					receivedEmail = true;
				}
			}`,
		unsafeTriggerHandlers: true,
	});
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "false");

	res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?from=someone@example.com&to=someone-else@example.com",
		{
			body: `From: someone <someone@example.com>
To: someone else <someone-else@example.com>
Message-ID: <im-a-random-message-id@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);
	t.is(await res.text(), "Worker successfully processed email");
	t.is(res.status, 200);

	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "true");
});

test("Miniflare: manually triggered email handler - setReject does not throw", async (t) => {
	const log = new TestLog(t);

	const mf = new Miniflare({
		log,
		modules: true,
		script: `
			let receivedEmail = false;
			export default {
				fetch() {
					return new Response(receivedEmail);
				},
				async email(emailMessage) {
					await emailMessage.setReject("I just don't like this email :(")
					receivedEmail = true;
				}
			}`,
		unsafeTriggerHandlers: true,
	});
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "false");

	res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?from=someone@example.com&to=someone-else@example.com",
		{
			body: `From: someone <someone@example.com>
To: someone else <someone-else@example.com>
Message-ID: <im-a-random-message-id@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);
	t.is(
		await res.text(),
		"Worker rejected email with the following reason: I just don't like this email :("
	);
	t.is(res.status, 400);

	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "true");
});

test("Miniflare: manually triggered email handler - forward does not throw", async (t) => {
	const log = new TestLog(t);

	const mf = new Miniflare({
		log,
		modules: true,
		script: `
			let receivedEmail = false;
			export default {
				fetch() {
					return new Response(receivedEmail);
				},
				async email(emailMessage) {
					await emailMessage.forward("mark.s@example.com")
					receivedEmail = true;
				}
			}`,
		unsafeTriggerHandlers: true,
	});
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "false");

	res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?from=someone@example.com&to=someone-else@example.com",
		{
			body: `From: someone <someone@example.com>
To: someone else <someone-else@example.com>
Message-ID: <im-a-random-message-id@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);
	t.is(await res.text(), "Worker successfully processed email");
	t.is(res.status, 200);

	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "true");
});

test("Miniflare: manually triggered email handler - invalid email, no message id", async (t) => {
	const log = new TestLog(t);

	const mf = new Miniflare({
		log,
		modules: true,
		script: `
			let receivedEmail = false;
			export default {
				fetch() {
					return new Response(receivedEmail);
				},
				email(emailMessage) {
					receivedEmail = true;
				}
			}`,
		unsafeTriggerHandlers: true,
	});
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "false");

	res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?from=someone@example.com&to=someone-else@example.com",
		{
			body: `From: someone <someone@example.com>
To: someone else <someone-else@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);
	t.is(
		await res.text(),
		"Email could not be parsed: invalid or no message id provided"
	);
	t.is(res.status, 400);

	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "false");
});

test("Miniflare: manually triggered email handler - reply handler works", async (t) => {
	const log = new TestLog(t);

	const mf = new Miniflare({
		log,
		modules: true,
		script: `
			import {EmailMessage} from "cloudflare:email"
			let receivedEmail = false;
			export default {
				fetch() {
					return new Response(receivedEmail);
				},
				async email(emailMessage) {
					await emailMessage.reply(new EmailMessage(
						"someone-else@example.com",
						"someone@example.com",
						(new Response(
\`From: someone else <someone-else@example.com>
To: someone <someone@example.com>
In-Reply-To: <im-a-random-message-id@example.com>
Message-ID: <im-another-random-message-id@example.com>
MIME-Version: 1.0
Content-Type: text/plain

This is a random email body.
\`)).body
					));

					receivedEmail = true;
				}
			}`,
		unsafeTriggerHandlers: true,
	});
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "false");

	res = await mf.dispatchFetch(
		"http://localhost/cdn-cgi/handler/email?from=someone@example.com&to=someone-else@example.com",
		{
			body: `From: someone <someone@example.com>
To: someone else <someone-else@example.com>
MIME-Version: 1.0
Message-ID: <im-a-random-message-id@example.com>
Content-Type: text/plain

This is a random email body.
`,
			method: "POST",
		}
	);
	t.is(await res.text(), "Worker successfully processed email");
	t.is(res.status, 200);

	res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "true");
});

test("Miniflare: listens on ipv6", async (t) => {
	const log = new TestLog(t);

	const mf = new Miniflare({
		log,
		modules: true,
		host: "*",
		script: `export default {
			fetch() {
				return new Response("Hello world");
			}
		}`,
	});
	t.teardown(() => mf.dispose());

	const url = await mf.ready;

	let response = await fetch(`http://localhost:${url.port}`);
	t.true(response.ok);

	response = await fetch(`http://[::1]:${url.port}`);
	t.true(response.ok);

	response = await fetch(`http://127.0.0.1:${url.port}`);
	t.true(response.ok);
});

test("Miniflare: dispose() immediately after construction", async (t) => {
	const mf = new Miniflare({ script: "", modules: true });
	const readyPromise = mf.ready;
	await mf.dispose();
	await t.throwsAsync(readyPromise, {
		instanceOf: MiniflareCoreError,
		code: "ERR_DISPOSED",
		message: "Cannot use disposed instance",
	});
});

test("Miniflare: getBindings() returns all bindings", async (t) => {
	const tmp = await useTmp(t);
	const blobPath = path.join(tmp, "blob.txt");
	await fs.writeFile(blobPath, "blob");
	const mf = new Miniflare({
		modules: true,
		script: `
			export class DurableObject {}
			export default { fetch() { return new Response(null, { status: 404 }); } }
		`,
		bindings: { STRING: "hello", OBJECT: { a: 1, b: { c: 2 } } },
		textBlobBindings: { TEXT: blobPath },
		dataBlobBindings: { DATA: blobPath },
		serviceBindings: { SELF: "" },
		d1Databases: ["DB"],
		durableObjects: { DO: "DurableObject" },
		kvNamespaces: ["KV"],
		queueProducers: ["QUEUE"],
		r2Buckets: ["BUCKET"],
	});
	let disposed = false;
	t.teardown(() => {
		if (!disposed) return mf.dispose();
	});

	interface Env {
		STRING: string;
		OBJECT: unknown;
		TEXT: string;
		DATA: ArrayBuffer;
		SELF: ReplaceWorkersTypes<Fetcher>;
		DB: D1Database;
		DO: ReplaceWorkersTypes<DurableObjectNamespace>;
		KV: ReplaceWorkersTypes<KVNamespace>;
		QUEUE: Queue<unknown>;
		BUCKET: ReplaceWorkersTypes<R2Bucket>;
	}
	const bindings = await mf.getBindings<Env>();

	t.like(bindings, {
		STRING: "hello",
		OBJECT: { a: 1, b: { c: 2 } },
		TEXT: "blob",
	});
	t.deepEqual(bindings.DATA, viewToBuffer(utf8Encode("blob")));

	const opts: util.InspectOptions = { colors: false };
	t.regex(util.inspect(bindings.SELF, opts), /name: 'Fetcher'/);
	t.regex(util.inspect(bindings.DB, opts), /name: 'D1Database'/);
	t.regex(util.inspect(bindings.DO, opts), /name: 'DurableObjectNamespace'/);
	t.regex(util.inspect(bindings.KV, opts), /name: 'KvNamespace'/);
	t.regex(util.inspect(bindings.QUEUE, opts), /name: 'WorkerQueue'/);
	t.regex(util.inspect(bindings.BUCKET, opts), /name: 'R2Bucket'/);

	// Check with WebAssembly binding (aren't supported by modules workers)
	const addWasmPath = path.join(tmp, "add.wasm");
	await fs.writeFile(addWasmPath, ADD_WASM_MODULE);
	await mf.setOptions({
		script:
			'addEventListener("fetch", (event) => event.respondWith(new Response(null, { status: 404 })));',
		wasmBindings: { ADD: addWasmPath },
	});
	const { ADD } = await mf.getBindings<{ ADD: WebAssembly.Module }>();
	const instance = new WebAssembly.Instance(ADD);
	assert(typeof instance.exports.add === "function");
	t.is(instance.exports.add(1, 2), 3);

	// Check bindings poisoned after dispose
	await mf.dispose();
	disposed = true;
	const expectations: ThrowsExpectation<Error> = {
		message:
			"Attempted to use poisoned stub. Stubs to runtime objects must be re-created after calling `Miniflare#setOptions()` or `Miniflare#dispose()`.",
	};
	t.throws(() => bindings.KV.get("key"), expectations);
});
test("Miniflare: getBindings() returns wrapped bindings", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				wrappedBindings: {
					Greeter: {
						scriptName: "greeter-implementation",
					},
				},
				modules: true,
				script: "",
			},
			{
				modules: true,
				name: "greeter-implementation",
				script: `
					class Greeter {
						sayHello(name) {
							return "Hello " + name;
						}
					}

					export default function (env) {
						return new Greeter();
					}
				`,
			},
		],
	});
	t.teardown(() => mf.dispose());

	interface Env {
		Greeter: {
			sayHello: (str: string) => string;
		};
	}
	const { Greeter } = await mf.getBindings<Env>();

	const helloWorld = Greeter.sayHello("World");

	t.is(helloWorld, "Hello World");
});
test("Miniflare: getBindings() handles wrapped bindings returning objects containing functions", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				wrappedBindings: {
					Greeter: {
						scriptName: "greeter-obj-implementation",
					},
				},
				modules: true,
				script: "",
			},
			{
				modules: true,
				name: "greeter-obj-implementation",
				script: `
					export default function (env) {
						const objWithFunction = {
							greeting: "Hello",
							sayHello(name) {
								return this.greeting + ' ' + name;
							}
						};
						return objWithFunction;
					}
				`,
			},
		],
	});
	t.teardown(() => mf.dispose());

	interface Env {
		Greeter: {
			greeting: string;
			sayHello: (str: string) => string;
		};
	}
	const { Greeter } = await mf.getBindings<Env>();

	const helloWorld = Greeter.sayHello("World");

	t.is(helloWorld, "Hello World");
	t.is(Greeter.greeting, "Hello");
});
test("Miniflare: getBindings() handles wrapped bindings returning objects containing nested functions", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				wrappedBindings: {
					Greeter: {
						scriptName: "greeter-obj-implementation",
					},
				},
				modules: true,
				script: "",
			},
			{
				modules: true,
				name: "greeter-obj-implementation",
				script: `
					export default function (env) {
						const objWithFunction = {
							obj: {
								obj1: {
									obj2: {
										sayHello: (name) => "Hello " + name + " from a nested function"
									}
								}
							}
						};
						return objWithFunction;
					}
				`,
			},
		],
	});
	t.teardown(() => mf.dispose());

	interface Env {
		Greeter: {
			obj: {
				obj1: {
					obj2: {
						sayHello: (str: string) => string;
					};
				};
			};
		};
	}
	const { Greeter } = await mf.getBindings<Env>();

	const helloWorld = Greeter.obj.obj1.obj2.sayHello("World");

	t.is(helloWorld, "Hello World from a nested function");
});
test("Miniflare: getBindings() handles wrapped bindings returning functions returning functions", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				wrappedBindings: {
					GreetFactory: {
						scriptName: "greet-factory-obj-implementation",
					},
				},
				modules: true,
				script: "",
			},
			{
				modules: true,
				name: "greet-factory-obj-implementation",
				script: `
					export default function (env) {
						const factory = {
							getGreetFunction(name) {
								return (name) => {
									return this.greeting + ' ' + name;
								}
							},
							greeting: "Salutations",
						};
						return factory;
					}
				`,
			},
		],
	});
	t.teardown(() => mf.dispose());

	interface Env {
		GreetFactory: {
			greeting: string;
			getGreetFunction: () => (str: string) => string;
		};
	}
	const { GreetFactory } = await mf.getBindings<Env>();

	const greetFunction = GreetFactory.getGreetFunction();

	t.is(greetFunction("Esteemed World"), "Salutations Esteemed World");
	t.is(GreetFactory.greeting, "Salutations");
});
test("Miniflare: getWorker() allows dispatching events directly", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: `
		let lastScheduledController;
		let lastQueueBatch;
		export default {
			async fetch(request, env, ctx) {
				const { pathname } = new URL(request.url);
				if (pathname === "/scheduled") {
					return Response.json({
						scheduledTime: lastScheduledController?.scheduledTime,
						cron: lastScheduledController?.cron,
					});
				} else if (pathname === "/queue") {
					return Response.json({
						queue: lastQueueBatch.queue,
						messages: lastQueueBatch.messages.map((message) => ({
						id: message.id,
						timestamp: message.timestamp.getTime(),
						body: message.body,
						bodyType: message.body.constructor.name,
						})),
					});
				} else if (pathname === "/get-url") {
					return new Response(request.url);
				} else {
					return new Response(null, { status: 404 });
				}
			},
			async scheduled(controller, env, ctx) {
				lastScheduledController = controller;
				if (controller.cron === "* * * * *") controller.noRetry();
			},
			async queue(batch, env, ctx) {
				lastQueueBatch = batch;
				if (batch.queue === "needy") batch.retryAll();
				for (const message of batch.messages) {
					if (message.id === "perfect") message.ack();
				}
			}
		}`,
	});
	t.teardown(() => mf.dispose());
	const fetcher = await mf.getWorker();

	// Check `Fetcher#scheduled()` (implicitly testing `Fetcher#fetch()`)
	let scheduledResult = await fetcher.scheduled({
		cron: "* * * * *",
	});
	t.deepEqual(scheduledResult, { outcome: "ok", noRetry: true });
	scheduledResult = await fetcher.scheduled({
		scheduledTime: new Date(1000),
		cron: "30 * * * *",
	});
	t.deepEqual(scheduledResult, { outcome: "ok", noRetry: false });

	let res = await fetcher.fetch("http://localhost/scheduled");
	const scheduledController = await res.json();
	t.deepEqual(scheduledController, {
		scheduledTime: 1000,
		cron: "30 * * * *",
	});

	// Check `Fetcher#queue()`
	let queueResult = await fetcher.queue("needy", [
		{ id: "a", timestamp: new Date(1000), body: "a", attempts: 1 },
		{ id: "b", timestamp: new Date(2000), body: { b: 1 }, attempts: 1 },
	]);
	t.deepEqual(queueResult, {
		outcome: "ok",
		ackAll: false,
		retryBatch: {
			retry: true,
		},
		explicitAcks: [],
		retryMessages: [],
	});
	queueResult = await fetcher.queue("queue", [
		{
			id: "c",
			timestamp: new Date(3000),
			body: new Uint8Array([1, 2, 3]),
			attempts: 1,
		},
		{
			id: "perfect",
			timestamp: new Date(4000),
			body: new Date(5000),
			attempts: 1,
		},
	]);
	t.deepEqual(queueResult, {
		outcome: "ok",
		ackAll: false,
		retryBatch: {
			retry: false,
		},
		explicitAcks: ["perfect"],
		retryMessages: [],
	});

	res = await fetcher.fetch("http://localhost/queue");
	const queueBatch = await res.json();
	t.deepEqual(queueBatch, {
		queue: "queue",
		messages: [
			{
				id: "c",
				timestamp: 3000,
				body: { 0: 1, 1: 2, 2: 3 },
				bodyType: "Uint8Array",
			},
			{
				id: "perfect",
				timestamp: 4000,
				body: "1970-01-01T00:00:05.000Z",
				bodyType: "Date",
			},
		],
	});

	// Check `Fetcher#fetch()`
	res = await fetcher.fetch("https://dummy:1234/get-url");
	t.is(await res.text(), "https://dummy:1234/get-url");
});
test("Miniflare: getBindings() and friends return bindings for different workers", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				name: "a",
				modules: true,
				script: `
					export class DurableObject {}
					export default { fetch() { return new Response("a"); } }
				`,
				d1Databases: ["DB"],
				durableObjects: { DO: "DurableObject" },
			},
			{
				// 2nd worker unnamed, to validate that not specifying a name when
				// getting bindings gives the entrypoint, not the unnamed worker
				script:
					'addEventListener("fetch", (event) => event.respondWith(new Response("unnamed")));',
				kvNamespaces: ["KV"],
				queueProducers: ["QUEUE"],
			},
			{
				name: "b",
				script:
					'addEventListener("fetch", (event) => event.respondWith(new Response("b")));',
				r2Buckets: ["BUCKET"],
			},
		],
	});
	t.teardown(() => mf.dispose());

	// Check `getBindings()`
	let bindings = await mf.getBindings();
	t.deepEqual(Object.keys(bindings), ["DB", "DO"]);
	bindings = await mf.getBindings("");
	t.deepEqual(Object.keys(bindings), ["KV", "QUEUE"]);
	bindings = await mf.getBindings("b");
	t.deepEqual(Object.keys(bindings), ["BUCKET"]);
	await t.throwsAsync(() => mf.getBindings("c"), {
		instanceOf: TypeError,
		message: '"c" worker not found',
	});

	// Check `getWorker()`
	let fetcher = await mf.getWorker();
	t.is(await (await fetcher.fetch("http://localhost")).text(), "a");
	fetcher = await mf.getWorker("");
	t.is(await (await fetcher.fetch("http://localhost")).text(), "unnamed");
	fetcher = await mf.getWorker("b");
	t.is(await (await fetcher.fetch("http://localhost")).text(), "b");
	await t.throwsAsync(() => mf.getWorker("c"), {
		instanceOf: TypeError,
		message: '"c" worker not found',
	});

	const unboundExpectations = (name: string): ThrowsExpectation<TypeError> => ({
		instanceOf: TypeError,
		message: `"${name}" unbound in "c" worker`,
	});

	// Check `getD1Database()`
	let binding: unknown = await mf.getD1Database("DB");
	t.not(binding, undefined);
	let expectations = unboundExpectations("DB");
	await t.throwsAsync(() => mf.getD1Database("DB", "c"), expectations);

	// Check `getDurableObjectNamespace()`
	binding = await mf.getDurableObjectNamespace("DO");
	t.not(binding, undefined);
	expectations = unboundExpectations("DO");
	await t.throwsAsync(
		() => mf.getDurableObjectNamespace("DO", "c"),
		expectations
	);

	// Check `getKVNamespace()`
	binding = await mf.getKVNamespace("KV", "");
	t.not(binding, undefined);
	expectations = unboundExpectations("KV");
	await t.throwsAsync(() => mf.getKVNamespace("KV", "c"), expectations);

	// Check `getQueueProducer()`
	binding = await mf.getQueueProducer("QUEUE", "");
	t.not(binding, undefined);
	expectations = unboundExpectations("QUEUE");
	await t.throwsAsync(() => mf.getQueueProducer("QUEUE", "c"), expectations);

	// Check `getR2Bucket()`
	binding = await mf.getR2Bucket("BUCKET", "b");
	t.not(binding, undefined);
	expectations = unboundExpectations("BUCKET");
	await t.throwsAsync(() => mf.getQueueProducer("BUCKET", "c"), expectations);
});

test("Miniflare: allows direct access to workers", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				name: "a",
				script: `addEventListener("fetch", (e) => e.respondWith(new Response("a")))`,
				unsafeDirectSockets: [{ port: 0 }],
			},
			{
				routes: ["*/*"],
				script: `addEventListener("fetch", (e) => e.respondWith(new Response("b")))`,
			},
			{
				name: "c",
				script: `addEventListener("fetch", (e) => e.respondWith(new Response("c")))`,
				unsafeDirectSockets: [{ host: "127.0.0.1" }],
			},
			{
				name: "d",
				compatibilityFlags: ["experimental"],
				modules: true,
				script: `
					import { WorkerEntrypoint } from "cloudflare:workers";
					export class One extends WorkerEntrypoint {
						fetch() { return new Response("d:1"); }
					}
					export const two = {
						fetch() { return new Response("d:2"); }
					};
					export const three = {
						fetch() { return new Response("d:2"); }
					};
				`,
				unsafeDirectSockets: [{ entrypoint: "One" }, { entrypoint: "two" }],
			},
		],
	});
	t.teardown(() => mf.dispose());

	// Check can access workers as usual
	let res = await mf.dispatchFetch("http://localhost/");
	t.is(await res.text(), "b");

	// Check can access workers directly
	// (`undefined` worker name should default to entrypoint, not unnamed worker)
	const aURL = await mf.unsafeGetDirectURL();
	const cURL = await mf.unsafeGetDirectURL("c");
	res = await fetch(aURL);
	t.is(await res.text(), "a");
	res = await fetch(cURL);
	t.is(await res.text(), "c");

	// Check can access workers directly with different entrypoints
	const d1URL = await mf.unsafeGetDirectURL("d", "One");
	const d2URL = await mf.unsafeGetDirectURL("d", "two");
	res = await fetch(d1URL);
	t.is(await res.text(), "d:1");
	res = await fetch(d2URL);
	t.is(await res.text(), "d:2");

	// Can can only access configured for direct access
	await t.throwsAsync(mf.unsafeGetDirectURL("z"), {
		instanceOf: TypeError,
		message: '"z" worker not found',
	});
	await t.throwsAsync(mf.unsafeGetDirectURL(""), {
		instanceOf: TypeError,
		message: 'Direct access disabled in "" worker for default entrypoint',
	});
	await t.throwsAsync(mf.unsafeGetDirectURL("d", "three"), {
		instanceOf: TypeError,
		message: 'Direct access disabled in "d" worker for "three" entrypoint',
	});
});
test("Miniflare: allows RPC between multiple instances", async (t) => {
	const mf1 = new Miniflare({
		unsafeDirectSockets: [{ entrypoint: "TestEntrypoint" }],
		compatibilityFlags: ["experimental"],
		modules: true,
		script: `
			import { WorkerEntrypoint } from "cloudflare:workers";
			export class TestEntrypoint extends WorkerEntrypoint {
				ping() { return "pong"; }
			}
		`,
	});
	t.teardown(() => mf1.dispose());

	const testEntrypointUrl = await mf1.unsafeGetDirectURL("", "TestEntrypoint");

	const mf2 = new Miniflare({
		serviceBindings: {
			SERVICE: { external: { address: testEntrypointUrl.host, http: {} } },
		},
		compatibilityFlags: ["experimental"],
		modules: true,
		script: `
			export default {
				async fetch(request, env, ctx) {
					const result = await env.SERVICE.ping();
					return new Response(result);
				}
			}
		`,
	});
	t.teardown(() => mf2.dispose());

	const res = await mf2.dispatchFetch("http://placeholder");
	t.is(await res.text(), "pong");
});

// Only test `MINIFLARE_WORKERD_PATH` on Unix. The test uses a Node.js script
// with a shebang, directly as the replacement `workerd` binary, which won't
// work on Windows.
const isWindows = process.platform === "win32";
const unixSerialTest = isWindows ? test.skip : test.serial;
unixSerialTest(
	"Miniflare: MINIFLARE_WORKERD_PATH overrides workerd path",
	async (t) => {
		const workerdPath = path.join(FIXTURES_PATH, "little-workerd.mjs");

		const original = process.env.MINIFLARE_WORKERD_PATH;
		process.env.MINIFLARE_WORKERD_PATH = workerdPath;
		t.teardown(() => {
			// Setting key/values pairs on `process.env` coerces values to strings
			if (original === undefined) delete process.env.MINIFLARE_WORKERD_PATH;
			else process.env.MINIFLARE_WORKERD_PATH = original;
		});

		const mf = new Miniflare({ script: "" });
		t.teardown(() => mf.dispose());

		const res = await mf.dispatchFetch("http://localhost");
		t.is(await res.text(), "When I grow up, I want to be a big workerd!");
	}
);

test("Miniflare: exits cleanly", async (t) => {
	const miniflarePath = require.resolve("miniflare");
	const result = childProcess.spawn(
		process.execPath,
		[
			"--no-warnings", // Hide experimental warnings
			"-e",
			`
			const { Miniflare, Log, LogLevel } = require(${JSON.stringify(miniflarePath)});
			const mf = new Miniflare({
				verbose: true,
				modules: true,
				script: \`export default {
					fetch() {
						return new Response("body");
					}
				}\`
			});
			(async () => {
				const res = await mf.dispatchFetch("http://placeholder/");
				const text = await res.text();
				process.send(text);
				process.disconnect();
			})();
	  `,
		],
		{
			stdio: [/* in */ "ignore", /* out */ "pipe", /* error */ "pipe", "ipc"],
		}
	);

	// Make sure workerd started
	const [message] = await once(result, "message");
	t.is(message, "body");

	// Check exit doesn't output anything
	const closePromise = once(result, "close");
	result.kill("SIGINT");
	assert(result.stdout !== null && result.stderr !== null);
	const stdout = await text(result.stdout);
	const stderr = await text(result.stderr);
	await closePromise;
	t.is(stdout, "");
	t.is(stderr, "");
});

test("Miniflare: supports unsafe eval bindings", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: `export default {
			fetch(req, env, ctx) {
				const three = env.UNSAFE_EVAL.eval("2 + 1");
				const fn = env.UNSAFE_EVAL.newFunction(
					"return \`the computed value is \${n}\`", "", "n"
				);
				return new Response(fn(three));
			}
		}`,
		unsafeEvalBinding: "UNSAFE_EVAL",
	});
	t.teardown(() => mf.dispose());

	const response = await mf.dispatchFetch("http://localhost");
	t.true(response.ok);
	t.is(await response.text(), "the computed value is 3");
});

test("Miniflare: supports wrapped bindings", async (t) => {
	const store = new Map<string, string>();
	const mf = new Miniflare({
		workers: [
			{
				wrappedBindings: {
					MINI_KV: {
						scriptName: "mini-kv",
						bindings: { NAMESPACE: "ns" },
					},
				},
				modules: true,
				script: `export default {
					async fetch(request, env, ctx) {
						await env.MINI_KV.set("key", "value");
						const value = await env.MINI_KV.get("key");
						await env.MINI_KV.delete("key");
						const emptyValue = await env.MINI_KV.get("key");
						await env.MINI_KV.set("key", "another value");
						return Response.json({ value, emptyValue });
					}
				}`,
			},
			{
				name: "mini-kv",
				serviceBindings: {
					async STORE(request) {
						const { pathname } = new URL(request.url);
						const key = pathname.substring(1);
						if (request.method === "GET") {
							const value = store.get(key);
							const status = value === undefined ? 404 : 200;
							return new Response(value ?? null, { status });
						} else if (request.method === "PUT") {
							const value = await request.text();
							store.set(key, value);
							return new Response(null, { status: 204 });
						} else if (request.method === "DELETE") {
							store.delete(key);
							return new Response(null, { status: 204 });
						} else {
							return new Response(null, { status: 405 });
						}
					},
				},
				modules: true,
				script: `
					class MiniKV {
						constructor(env) {
							this.STORE = env.STORE;
							this.baseURL = "http://x/" + (env.NAMESPACE ?? "") + ":";
						}
						async get(key) {
							const res = await this.STORE.fetch(this.baseURL + key);
							return res.status === 404 ? null : await res.text();
						}
						async set(key, body) {
							await this.STORE.fetch(this.baseURL + key, { method: "PUT", body });
						}
						async delete(key) {
							await this.STORE.fetch(this.baseURL + key, { method: "DELETE" });
						}
					}

					export default function (env) {
						return new MiniKV(env);
					}
				`,
			},
		],
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://localhost/");
	t.deepEqual(await res.json(), { value: "value", emptyValue: null });
	t.deepEqual(store, new Map([["ns:key", "another value"]]));
});
test("Miniflare: check overrides default bindings with bindings from wrapped binding designator", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				wrappedBindings: {
					WRAPPED: {
						scriptName: "binding",
						entrypoint: "wrapped",
						bindings: { B: "overridden b" },
					},
				},
				modules: true,
				script: `export default {
					fetch(request, env, ctx) {
						return env.WRAPPED();
					}
				}`,
			},
			{
				name: "binding",
				modules: true,
				bindings: { A: "default a", B: "default b" },
				script: `export function wrapped(env) {
					return () => Response.json(env);
				}`,
			},
		],
	});
	t.teardown(() => mf.dispose());

	const res = await mf.dispatchFetch("http://localhost/");
	t.deepEqual(await res.json(), { A: "default a", B: "overridden b" });
});
test("Miniflare: checks uses compatibility and outbound configuration of binder", async (t) => {
	const workers: WorkerOptions[] = [
		{
			compatibilityDate: "2022-03-21", // Default-on date for `global_navigator`
			compatibilityFlags: ["nodejs_compat"],
			wrappedBindings: { WRAPPED: "binding" },
			modules: true,
			script: `export default {
				fetch(request, env, ctx) {
					return env.WRAPPED();
				}
			}`,
			outboundService(request) {
				return new Response(`outbound:${request.url}`);
			},
		},
		{
			name: "binding",
			modules: [
				{
					type: "ESModule",
					path: "index.mjs",
					contents: `export default function () {
						return async () => {
							const typeofNavigator = typeof navigator;
							let importedNode = false;
							try {
								await import("node:util");
								importedNode = true;
							} catch {}
							const outboundRes = await fetch("http://placeholder/");
							const outboundText = await outboundRes.text();
							return Response.json({ typeofNavigator, importedNode, outboundText });
						}
					}`,
				},
			],
		},
	];
	const mf = new Miniflare({ workers });
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("http://localhost/");
	t.deepEqual(await res.json(), {
		typeofNavigator: "object",
		importedNode: true,
		outboundText: "outbound:http://placeholder/",
	});

	const fetchMock = createFetchMock();
	fetchMock.disableNetConnect();
	fetchMock
		.get("http://placeholder")
		.intercept({ path: "/" })
		.reply(200, "mocked");
	workers[0].compatibilityDate = "2022-03-20";
	workers[0].compatibilityFlags = [];
	workers[0].outboundService = undefined;
	workers[0].fetchMock = fetchMock;
	await mf.setOptions({ workers });
	res = await mf.dispatchFetch("http://localhost/");
	t.deepEqual(await res.json(), {
		typeofNavigator: "undefined",
		importedNode: false,
		outboundText: "mocked",
	});
});
test("Miniflare: cannot call getWorker() on wrapped binding worker", async (t) => {
	const mf = new Miniflare({
		workers: [
			{
				wrappedBindings: { WRAPPED: "binding" },
				modules: true,
				script: `export default {
					fetch(request, env, ctx) {
						return env.WRAPPED;
					}
				}`,
			},
			{
				name: "binding",
				modules: true,
				script: `export default function () {
					return "🎁";
				}`,
			},
		],
	});
	t.teardown(() => mf.dispose());

	await t.throwsAsync(mf.getWorker("binding"), {
		instanceOf: TypeError,
		message:
			'"binding" is being used as a wrapped binding, and cannot be accessed as a worker',
	});
});
test("Miniflare: prohibits invalid wrapped bindings", async (t) => {
	const mf = new Miniflare({ modules: true, script: "" });
	t.teardown(() => mf.dispose());

	// Check prohibits using entrypoint worker
	await t.throwsAsync(
		mf.setOptions({
			name: "a",
			modules: true,
			script: "",
			wrappedBindings: {
				WRAPPED: { scriptName: "a", entrypoint: "wrapped" },
			},
		}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_INVALID_WRAPPED",
			message:
				'Cannot use "a" for wrapped binding because it\'s the entrypoint.\n' +
				'Ensure "a" isn\'t the first entry in the `workers` array.',
		}
	);

	// Check prohibits using service worker
	await t.throwsAsync(
		mf.setOptions({
			workers: [
				{ modules: true, script: "", wrappedBindings: { WRAPPED: "binding" } },
				{ name: "binding", script: "" },
			],
		}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_INVALID_WRAPPED",
			message:
				'Cannot use "binding" for wrapped binding because it\'s a service worker.\n' +
				'Ensure "binding" sets `modules` to `true` or an array of modules',
		}
	);

	// Check prohibits multiple modules
	await t.throwsAsync(
		mf.setOptions({
			workers: [
				{ modules: true, script: "", wrappedBindings: { WRAPPED: "binding" } },
				{
					name: "binding",
					modules: [
						{ type: "ESModule", path: "index.mjs", contents: "" },
						{ type: "ESModule", path: "dep.mjs", contents: "" },
					],
				},
			],
		}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_INVALID_WRAPPED",
			message:
				'Cannot use "binding" for wrapped binding because it isn\'t a single module.\n' +
				'Ensure "binding" doesn\'t include unbundled `import`s.',
		}
	);

	// Check prohibits non-ES-modules
	await t.throwsAsync(
		mf.setOptions({
			workers: [
				{ modules: true, script: "", wrappedBindings: { WRAPPED: "binding" } },
				{
					name: "binding",
					modules: [{ type: "CommonJS", path: "index.cjs", contents: "" }],
				},
			],
		}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_INVALID_WRAPPED",
			message:
				'Cannot use "binding" for wrapped binding because it isn\'t a single ES module',
		}
	);

	// Check prohibits Durable Object bindings
	await t.throwsAsync(
		mf.setOptions({
			workers: [
				{
					modules: true,
					script: "",
					wrappedBindings: { WRAPPED: "binding" },
					durableObjects: {
						OBJECT: { scriptName: "binding", className: "TestObject" },
					},
				},
				{
					name: "binding",
					modules: [{ type: "ESModule", path: "index.mjs", contents: "" }],
				},
			],
		}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_INVALID_WRAPPED",
			message:
				'Cannot use "binding" for wrapped binding because it is bound to with Durable Object bindings.\n' +
				'Ensure other workers don\'t define Durable Object bindings to "binding".',
		}
	);

	// Check prohibits service bindings
	await t.throwsAsync(
		mf.setOptions({
			workers: [
				{
					modules: true,
					script: "",
					wrappedBindings: {
						WRAPPED: { scriptName: "binding", entrypoint: "wrapped" },
					},
					serviceBindings: { SERVICE: "binding" },
				},
				{
					name: "binding",
					modules: [{ type: "ESModule", path: "index.mjs", contents: "" }],
				},
			],
		}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_INVALID_WRAPPED",
			message:
				'Cannot use "binding" for wrapped binding because it is bound to with service bindings.\n' +
				'Ensure other workers don\'t define service bindings to "binding".',
		}
	);

	// Check prohibits compatibility date and flags
	await t.throwsAsync(
		mf.setOptions({
			workers: [
				{ modules: true, script: "", wrappedBindings: { WRAPPED: "binding" } },
				{
					name: "binding",
					compatibilityDate: "2023-11-01",
					modules: [{ type: "ESModule", path: "index.mjs", contents: "" }],
				},
			],
		}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_INVALID_WRAPPED",
			message:
				'Cannot use "binding" for wrapped binding because it defines a compatibility date.\n' +
				"Wrapped bindings use the compatibility date of the worker with the binding.",
		}
	);
	await t.throwsAsync(
		mf.setOptions({
			workers: [
				{ modules: true, script: "", wrappedBindings: { WRAPPED: "binding" } },
				{
					name: "binding",
					compatibilityFlags: ["nodejs_compat"],
					modules: [{ type: "ESModule", path: "index.mjs", contents: "" }],
				},
			],
		}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_INVALID_WRAPPED",
			message:
				'Cannot use "binding" for wrapped binding because it defines compatibility flags.\n' +
				"Wrapped bindings use the compatibility flags of the worker with the binding.",
		}
	);

	// Check prohibits outbound service
	await t.throwsAsync(
		mf.setOptions({
			workers: [
				{ modules: true, script: "", wrappedBindings: { WRAPPED: "binding" } },
				{
					name: "binding",
					outboundService() {
						assert.fail();
					},
					modules: [{ type: "ESModule", path: "index.mjs", contents: "" }],
				},
			],
		}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_INVALID_WRAPPED",
			message:
				'Cannot use "binding" for wrapped binding because it defines an outbound service.\n' +
				"Wrapped bindings use the outbound service of the worker with the binding.",
		}
	);

	// Check prohibits cyclic wrapped bindings
	await t.throwsAsync(
		mf.setOptions({
			workers: [
				{ modules: true, script: "", wrappedBindings: { WRAPPED: "binding" } },
				{
					name: "binding",
					wrappedBindings: { WRAPPED: "binding" }, // Simple cycle
					modules: [{ type: "ESModule", path: "index.mjs", contents: "" }],
				},
			],
		}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_CYCLIC",
			message:
				"Generated workerd config contains cycles. Ensure wrapped bindings don't have bindings to themselves.",
		}
	);
	await t.throwsAsync(
		mf.setOptions({
			workers: [
				{
					modules: true,
					script: "",
					wrappedBindings: { WRAPPED1: "binding-1" },
				},
				{
					name: "binding-1",
					wrappedBindings: { WRAPPED2: "binding-2" },
					modules: [{ type: "ESModule", path: "index.mjs", contents: "" }],
				},
				{
					name: "binding-2",
					wrappedBindings: { WRAPPED3: "binding-3" },
					modules: [{ type: "ESModule", path: "index.mjs", contents: "" }],
				},
				{
					name: "binding-3",
					wrappedBindings: { WRAPPED1: "binding-1" }, // Multi-step cycle
					modules: [{ type: "ESModule", path: "index.mjs", contents: "" }],
				},
			],
		}),
		{
			instanceOf: MiniflareCoreError,
			code: "ERR_CYCLIC",
			message:
				"Generated workerd config contains cycles. Ensure wrapped bindings don't have bindings to themselves.",
		}
	);
});

test("Miniflare: getCf() returns a standard cf object", async (t) => {
	const mf = new Miniflare({ script: "", modules: true });
	t.teardown(() => mf.dispose());

	const cf = await mf.getCf();
	t.like(cf, {
		colo: "DFW",
		city: "Austin",
		regionCode: "TX",
	});
});

test("Miniflare: getCf() returns a user provided cf object", async (t) => {
	const mf = new Miniflare({
		script: "",
		modules: true,
		cf: {
			myFakeField: "test",
		},
	});
	t.teardown(() => mf.dispose());

	const cf = await mf.getCf();
	t.deepEqual(cf, { myFakeField: "test" });
});

test("Miniflare: dispatchFetch() can override cf", async (t) => {
	const mf = new Miniflare({
		script:
			"export default { fetch(request) { return Response.json(request.cf) } }",
		modules: true,
		cf: {
			myFakeField: "test",
		},
	});
	t.teardown(() => mf.dispose());

	const cf = await mf.dispatchFetch("http://example.com/", {
		cf: { myFakeField: "test2" },
	});
	const cfJson = (await cf.json()) as { myFakeField: string };
	t.deepEqual(cfJson.myFakeField, "test2");
});

test("Miniflare: CF-Connecting-IP is injected", async (t) => {
	const mf = new Miniflare({
		script:
			"export default { fetch(request) { return new Response(request.headers.get('CF-Connecting-IP')) } }",
		modules: true,
		cf: {
			myFakeField: "test",
		},
	});
	t.teardown(() => mf.dispose());

	const ip = await mf.dispatchFetch("http://example.com/");
	// Tracked in https://github.com/cloudflare/workerd/issues/3310
	if (!isWindows) {
		t.deepEqual(await ip.text(), "127.0.0.1");
	} else {
		t.deepEqual(await ip.text(), "");
	}
});

test("Miniflare: CF-Connecting-IP is injected (ipv6)", async (t) => {
	const mf = new Miniflare({
		script:
			"export default { fetch(request) { return new Response(request.headers.get('CF-Connecting-IP')) } }",
		modules: true,
		cf: {
			myFakeField: "test",
		},
		host: "::1",
	});
	t.teardown(() => mf.dispose());

	const ip = await mf.dispatchFetch("http://example.com/");

	// Tracked in https://github.com/cloudflare/workerd/issues/3310
	if (!isWindows) {
		t.deepEqual(await ip.text(), "::1");
	} else {
		t.deepEqual(await ip.text(), "");
	}
});

test("Miniflare: CF-Connecting-IP is preserved when present", async (t) => {
	const mf = new Miniflare({
		script:
			"export default { fetch(request) { return new Response(request.headers.get('CF-Connecting-IP')) } }",
		modules: true,
		cf: {
			myFakeField: "test",
		},
	});
	t.teardown(() => mf.dispose());

	const ip = await mf.dispatchFetch("http://example.com/", {
		headers: {
			"CF-Connecting-IP": "128.0.0.1",
		},
	});
	t.deepEqual(await ip.text(), "128.0.0.1");
});

// regression test for https://github.com/cloudflare/workers-sdk/issues/7924
// The "server" service just returns the value of the CF-Connecting-IP header which would normally be added by Miniflare. If you send a request to with no such header, Miniflare will add one.
// The "client" service makes an outbound request with a fake CF-Connecting-IP header to the "server" service. If the outbound stripping happens then this header will not make it to the "server" service
// so its response will contain the header added by Miniflare. If the stripping is turned off then the response from the "server" service will contain the fake header.
test("Miniflare: strips CF-Connecting-IP", async (t) => {
	const server = new Miniflare({
		script:
			"export default { fetch(request) { return new Response(request.headers.get(`CF-Connecting-IP`)) } }",
		modules: true,
	});
	const serverUrl = await server.ready;

	const client = new Miniflare({
		script: `export default { fetch(request) { return fetch('${serverUrl.href}', {headers: {"CF-Connecting-IP":"fake-value"}}) } }`,
		modules: true,
	});
	t.teardown(() => client.dispose());
	t.teardown(() => server.dispose());

	const landingPage = await client.dispatchFetch("http://example.com/");
	// The CF-Connecting-IP header value of "fake-value" should be stripped by Miniflare, and should be replaced with a generic 127.0.0.1
	t.notDeepEqual(await landingPage.text(), "fake-value");
});

test("Miniflare: does not strip CF-Connecting-IP when configured", async (t) => {
	const server = new Miniflare({
		script:
			"export default { fetch(request) { return new Response(request.headers.get(`CF-Connecting-IP`)) } }",
		modules: true,
	});
	const serverUrl = await server.ready;

	const client = new Miniflare({
		script: `export default { fetch(request) { return fetch('${serverUrl.href}', {headers: {"CF-Connecting-IP":"fake-value"}}) } }`,
		modules: true,
		stripCfConnectingIp: false,
	});
	t.teardown(() => client.dispose());
	t.teardown(() => server.dispose());

	const landingPage = await client.dispatchFetch("http://example.com/");
	t.deepEqual(await landingPage.text(), "fake-value");
});

test("Miniflare: can use module fallback service", async (t) => {
	const modulesRoot = "/";
	const modules: Record<string, Omit<Worker_Module, "name">> = {
		"/virtual/a.mjs": {
			esModule: `
			import { b } from "./dir/b.mjs";
			export default "a" + b;
			`,
		},
		"/virtual/dir/b.mjs": {
			esModule: 'export { default as b } from "./c.cjs";',
		},
		"/virtual/dir/c.cjs": {
			commonJsModule: 'module.exports = "c" + require("./sub/d.cjs");',
		},
		"/virtual/dir/sub/d.cjs": {
			commonJsModule: 'module.exports = "d";',
		},
	};

	const mf = new Miniflare({
		unsafeModuleFallbackService(request) {
			const resolveMethod = request.headers.get("X-Resolve-Method");
			assert(resolveMethod === "import" || resolveMethod === "require");
			const url = new URL(request.url);
			const specifier = url.searchParams.get("specifier");
			assert(specifier !== null);
			const maybeModule = modules[specifier];
			if (maybeModule === undefined) return new Response(null, { status: 404 });
			const name = path.posix.relative(modulesRoot, specifier);
			return new Response(JSON.stringify({ name, ...maybeModule }));
		},
		workers: [
			{
				name: "a",
				routes: ["*/a"],
				compatibilityFlags: ["export_commonjs_default"],
				modulesRoot,
				modules: [
					{
						type: "ESModule",
						path: "/virtual/index.mjs",
						contents: `
							import a from "./a.mjs";
							export default {
								async fetch() {
									return new Response(a);
								}
							}
						`,
					},
				],
				unsafeUseModuleFallbackService: true,
			},
			{
				name: "b",
				routes: ["*/b"],
				compatibilityFlags: ["export_commonjs_default"],
				modulesRoot,
				modules: [
					{
						type: "ESModule",
						path: "/virtual/index.mjs",
						contents: `
							export default {
								async fetch() {
									try {
										await import("./a.mjs");
										return new Response(null, { status: 204 });
									} catch (e) {
										return new Response(String(e), { status: 500 });
									}
								}
							}
						`,
					},
				],
			},
		],
	});
	t.teardown(() => mf.dispose());

	let res = await mf.dispatchFetch("http://localhost/a");
	t.is(await res.text(), "acd");

	// Check fallback service ignored if not explicitly enabled
	res = await mf.dispatchFetch("http://localhost/b");
	t.is(res.status, 500);
	t.is(await res.text(), 'Error: No such module "virtual/a.mjs".');
});

test.serial(
	"Miniflare: respects rootPath for path-valued options",
	async (t) => {
		const tmp = await useTmp(t);
		const aPath = path.join(tmp, "a");
		const bPath = path.join(tmp, "b");
		await fs.mkdir(aPath);
		await fs.mkdir(bPath);
		await fs.writeFile(path.join(aPath, "1.txt"), "one text");
		await fs.writeFile(path.join(aPath, "1.bin"), "one data");
		await fs.writeFile(path.join(aPath, "add.wasm"), ADD_WASM_MODULE);
		await fs.writeFile(path.join(bPath, "2.txt"), "two text");
		await fs.writeFile(path.join(tmp, "3.txt"), "three text");
		const mf = new Miniflare({
			rootPath: tmp,
			kvPersist: "kv",
			workers: [
				{
					name: "a",
					rootPath: "a",
					routes: ["*/a"],
					textBlobBindings: { TEXT: "1.txt" },
					dataBlobBindings: { DATA: "1.bin" },
					wasmBindings: { ADD: "add.wasm" },
					// WASM bindings aren't supported by modules workers
					script: `addEventListener("fetch", (event) => {
						event.respondWith(Response.json({
							text: TEXT,
							data: new TextDecoder().decode(DATA),
							result: new WebAssembly.Instance(ADD).exports.add(1, 2)
						}));
					});`,
				},
				{
					name: "b",
					rootPath: "b",
					routes: ["*/b"],
					textBlobBindings: { TEXT: "2.txt" },
					sitePath: ".",
					script: `addEventListener("fetch", (event) => {
						event.respondWith(Response.json({
							text: TEXT,
							manifest: Object.keys(__STATIC_CONTENT_MANIFEST)
						}));
					});`,
				},
				{
					name: "c",
					routes: ["*/c"],
					textBlobBindings: { TEXT: "3.txt" },
					kvNamespaces: { NAMESPACE: "namespace" },
					modules: true,
					script: `export default {
						async fetch(request, env, ctx) {
						 	await env.NAMESPACE.put("key", "value");
							return Response.json({ text: env.TEXT });
						}
					}`,
				},
			],
		});
		t.teardown(() => mf.dispose());

		let res = await mf.dispatchFetch("http://localhost/a");
		t.deepEqual(await res.json(), {
			text: "one text",
			data: "one data",
			result: 3,
		});
		res = await mf.dispatchFetch("http://localhost/b");
		t.deepEqual(await res.json(), {
			text: "two text",
			manifest: ["2.txt"],
		});
		res = await mf.dispatchFetch("http://localhost/c");
		t.deepEqual(await res.json(), {
			text: "three text",
		});
		t.true(existsSync(path.join(tmp, "kv", "namespace")));

		// Check persistence URLs not resolved relative to root path
		await mf.setOptions({
			rootPath: tmp,
			kvPersist: url.pathToFileURL(path.join(tmp, "kv")).href,
			kvNamespaces: { NAMESPACE: "namespace" },
			modules: true,
			script: `export default {
				async fetch(request, env, ctx) {
					return new Response(await env.NAMESPACE.get("key"));
				}
			}`,
		});
		res = await mf.dispatchFetch("http://localhost");
		t.is(await res.text(), "value");

		// Check only resolves root path once for single worker options (with relative
		// root path)
		useCwd(t, tmp);
		await mf.setOptions({
			rootPath: "a",
			textBlobBindings: { TEXT: "1.txt" },
			script:
				'addEventListener("fetch", (event) => event.respondWith(new Response(TEXT)));',
		});
		res = await mf.dispatchFetch("http://localhost");
		t.is(await res.text(), "one text");
	}
);

test("Miniflare: custom Node service binding", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: `
		export default {
			fetch(request, env) {
				return env.CUSTOM.fetch(request, {
					headers: {
						"custom-header": "foo"
					}
				});
			}
		}`,
		serviceBindings: {
			CUSTOM: {
				node: (req, res) => {
					res.end(
						`Response from custom Node service binding. The value of "custom-header" is "${req.headers["custom-header"]}".`
					);
				},
			},
		},
	});
	t.teardown(() => mf.dispose());

	const response = await mf.dispatchFetch("http://localhost");
	const text = await response.text();
	t.is(
		text,
		`Response from custom Node service binding. The value of "custom-header" is "foo".`
	);
});

test("Miniflare: custom Node outbound service", async (t) => {
	const mf = new Miniflare({
		modules: true,
		script: `
		export default {
			fetch(request, env) {
				return fetch(request, {
					headers: {
						"custom-header": "foo"
					}
				});
			}
		}`,
		outboundService: {
			node: (req, res) => {
				res.end(
					`Response from custom Node outbound service. The value of "custom-header" is "foo".`
				);
			},
		},
	});
	t.teardown(() => mf.dispose());

	const response = await mf.dispatchFetch("http://localhost");
	const text = await response.text();
	t.is(
		text,
		`Response from custom Node outbound service. The value of "custom-header" is "foo".`
	);
});

test("Miniflare: MINIFLARE_WORKERD_CONFIG_DEBUG controls workerd config file creation", async (t) => {
	const originalEnv = process.env.MINIFLARE_WORKERD_CONFIG_DEBUG;
	const configFilePath = "workerd-config.json";

	// Clean up any existing config file
	if (existsSync(configFilePath)) {
		await fs.unlink(configFilePath);
	}

	t.teardown(async () => {
		if (originalEnv === undefined) {
			delete process.env.MINIFLARE_WORKERD_CONFIG_DEBUG;
		} else {
			process.env.MINIFLARE_WORKERD_CONFIG_DEBUG = originalEnv;
		}
		if (existsSync(configFilePath)) {
			await fs.unlink(configFilePath);
		}
	});

	// ensure the config file is not created without the flag
	delete process.env.MINIFLARE_WORKERD_CONFIG_DEBUG;
	let mf = new Miniflare({
		modules: true,
		script: `export default {
			fetch() {
				return new Response("Hello World");
			}
		}`,
	});
	// Trigger workerd config serialization by dispatching a request
	let response = await mf.dispatchFetch("http://localhost");
	// seems like miniflare doesn't like it if you don't read the response
	await response.text();
	t.false(
		existsSync(configFilePath),
		"config file should not be created when MINIFLARE_WORKERD_CONFIG_DEBUG is not set"
	);
	await mf.dispose();

	// ensure the config file is created with the flag
	process.env.MINIFLARE_WORKERD_CONFIG_DEBUG = configFilePath;
	mf = new Miniflare({
		modules: true,
		script: `export default {
			fetch() {
				return new Response("Hello World");
			}
		}`,
	});
	response = await mf.dispatchFetch("http://localhost");
	await response.text();
	t.true(
		existsSync(configFilePath),
		"workerd-config.json should be created when MINIFLARE_WORKERD_CONFIG_DEBUG=true"
	);
	await mf.dispose();
});

test("Miniflare: logs are treated as standard stdout/stderr chunks be default", async (t) => {
	const collected = {
		stdout: "",
		stderr: "",
	};
	const mf = new Miniflare({
		modules: true,
		handleRuntimeStdio(stdout, stderr) {
			stdout.forEach((data) => {
				collected.stdout += `${data}`;
			});
			stderr.forEach((error) => {
				collected.stderr += `${error}`;
			});
		},
		script: `
			export default {
				async fetch(req, env) {
				console.log('__LOG__');
				console.warn('__WARN__');
				console.error('__ERROR__');
				console.info('__INFO__');
				console.debug('__DEBUG__');
				return new Response('Hello world!');
			}
		}`,
	});
	t.teardown(() => mf.dispose());

	const response = await mf.dispatchFetch("http://localhost");
	await response.text();

	t.is(collected.stdout, "__LOG__\n__INFO__\n__DEBUG__\n");
	t.is(collected.stderr, "__WARN__\n__ERROR__\n");
});

test("Miniflare: logs are structured and all sent to stdout when structuredWorkerdLogs is true", async (t) => {
	const collected = {
		stdout: "",
		stderr: "",
	};
	const mf = new Miniflare({
		modules: true,
		structuredWorkerdLogs: true,
		handleRuntimeStdio(stdout, stderr) {
			stdout.forEach((data) => {
				collected.stdout += `${data}`;
			});
			stderr.forEach((error) => {
				collected.stderr += `${error}`;
			});
		},
		script: `
			export default {
				async fetch(req, env) {
				console.log('__LOG__');
				console.warn('__WARN__');
				console.error('__ERROR__');
				console.info('__INFO__');
				console.debug('__DEBUG__');
				return new Response('Hello world!');
			}
		}`,
	});
	t.teardown(() => mf.dispose());

	const response = await mf.dispatchFetch("http://localhost");
	await response.text();

	t.regex(
		collected.stdout,
		/{"timestamp":\d+,"level":"log","message":"__LOG__"}/
	);
	t.regex(
		collected.stdout,
		/{"timestamp":\d+,"level":"warn","message":"__WARN__"}/
	);
	t.regex(
		collected.stdout,
		/{"timestamp":\d+,"level":"error","message":"__ERROR__"}/
	);
	t.regex(
		collected.stdout,
		/{"timestamp":\d+,"level":"info","message":"__INFO__"}/
	);
	t.regex(
		collected.stdout,
		/{"timestamp":\d+,"level":"debug","message":"__DEBUG__"}/
	);

	t.is(collected.stderr, "");
});
