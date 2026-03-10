// noinspection TypeScriptValidateJSTypes

import assert from "node:assert";
import childProcess from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { json, text } from "node:stream/consumers";
import url from "node:url";
import util from "node:util";
import {
	D1Database,
	DurableObjectNamespace,
	Fetcher,
	KVNamespace,
	Queue,
	R2Bucket,
} from "@cloudflare/workers-types/experimental";
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
import { onTestFinished, test } from "vitest";
import {
	CloseEvent as StandardCloseEvent,
	MessageEvent as StandardMessageEvent,
	WebSocketServer,
} from "ws";
import {
	FIXTURES_PATH,
	TestLog,
	useCwd,
	useDispose,
	useServer,
	useTmp,
	utf8Encode,
} from "./test-shared";

// (base64 encoded module containing a single `add(i32, i32): i32` export)
const ADD_WASM_MODULE = Buffer.from(
	"AGFzbQEAAAABBwFgAn9/AX8DAgEABwcBA2FkZAAACgkBBwAgACABagsACgRuYW1lAgMBAAA=",
	"base64"
);

test("Miniflare: validates options", async ({ expect }) => {
	// Check empty workers array rejected
	expect(() => new Miniflare({ workers: [] })).toThrow(
		new MiniflareCoreError("ERR_NO_WORKERS", "No workers defined")
	);

	// Check workers with the same name rejected
	expect(
		() =>
			new Miniflare({
				workers: [{ script: "" }, { script: "" }],
			})
	).toThrow(
		new MiniflareCoreError(
			"ERR_DUPLICATE_NAME",
			"Multiple workers defined without a `name`"
		)
	);
	expect(
		() =>
			new Miniflare({
				workers: [
					{ script: "" },
					{ script: "", name: "a" },
					{ script: "", name: "b" },
					{ script: "", name: "a" },
				],
			})
	).toThrow(
		new MiniflareCoreError(
			"ERR_DUPLICATE_NAME",
			'Multiple workers defined with the same `name`: "a"'
		)
	);

	// Disable colours for easier to read expectations
	_forceColour(false);
	onTestFinished(() => _forceColour());

	// Check throws validation error with incorrect options
	let error: MiniflareCoreError | undefined = undefined;
	try {
		// @ts-expect-error intentionally testing incorrect types
		new Miniflare({ name: 42, script: "" });
	} catch (e) {
		error = e as MiniflareCoreError;
	}
	expect(error).toBeInstanceOf(MiniflareCoreError);
	expect(error?.code).toEqual("ERR_VALIDATION");
	expect(error?.message).toEqual(
		`Unexpected options passed to \`new Miniflare()\` constructor:
{
  name: 42,
        ^ Expected string, received number
  ...,
}`
	);

	// Check throws validation error with primitive option
	error = undefined;
	try {
		// @ts-expect-error intentionally testing incorrect types
		new Miniflare("addEventListener(...)");
	} catch (e) {
		error = e as MiniflareCoreError;
	}
	expect(error).toBeInstanceOf(MiniflareCoreError);
	expect(error?.code).toEqual("ERR_VALIDATION");
	expect(error?.message).toEqual(
		`Unexpected options passed to \`new Miniflare()\` constructor:
'addEventListener(...)'
^ Expected object, received string`
	);
});

test("Miniflare: ready returns copy of entry URL", async ({ expect }) => {
	const mf = new Miniflare({
		port: 0,
		modules: true,
		script: "",
	});
	useDispose(mf);

	const url1 = await mf.ready;
	url1.protocol = "ws:";
	const url2 = await mf.ready;
	expect(url1).not.toBe(url2);
	expect(url2.protocol).toBe("http:");
});

test("Miniflare: setOptions: can update host/port", async ({ expect }) => {
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
	useDispose(mf);

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
	expect(state1.url.port).not.toBe("0");
	expect(state1.url.port).toBe(state2.url.port);
	expect(state1.inspectorUrl.port).not.toBe("0");
	expect(state1.inspectorUrl.port).toBe(state2.inspectorUrl.port);

	// Make sure updating the host restarted the loopback server
	expect(state1.loopbackPort).toBeDefined();
	expect(state2.loopbackPort).toBeDefined();
	expect(state1.loopbackPort).not.toBe(state2.loopbackPort);

	// Make sure setting port to `undefined` always gives a new port, but keeps
	// existing loopback server
	opts.port = undefined;
	await mf.setOptions(opts);
	const state3 = await getState();
	expect(state3.url.port).not.toBe("0");
	expect(state1.url.port).not.toBe(state3.url.port);
	expect(state2.loopbackPort).toBe(state3.loopbackPort);
});

const interfaces = os.networkInterfaces();
const localInterface = (interfaces["en0"] ?? interfaces["eth0"])?.find(
	({ family }) => family === "IPv4"
);
(localInterface === undefined ? test.skip : test)(
	"Miniflare: can use local network address as host",
	async ({ expect }) => {
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
		useDispose(mf);

		let res = await mf.dispatchFetch("https://example.com");
		expect(await res.text()).toBe("body");

		const worker = await mf.getWorker();
		res = await worker.fetch("https://example.com");
		expect(await res.text()).toBe("body");
	}
);
test("Miniflare: can use IPv6 loopback as host", async ({ expect }) => {
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
	useDispose(mf);

	let res = await mf.dispatchFetch("https://example.com");
	expect(await res.text()).toBe("body");

	const worker = await mf.getWorker();
	res = await worker.fetch("https://example.com");
	expect(await res.text()).toBe("body");
});

test("Miniflare: routes to multiple workers with fallback", async ({
	expect,
}) => {
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
	useDispose(mf);

	// Check "a"'s more specific route checked first
	let res = await mf.dispatchFetch("http://localhost/api");
	expect(await res.text()).toBe("a");

	// Check "b" still accessible
	res = await mf.dispatchFetch("http://localhost/api/2");
	expect(await res.text()).toBe("b");

	// Check fallback to first
	res = await mf.dispatchFetch("http://localhost/notapi");
	expect(await res.text()).toBe("a");
});

test("Miniflare: custom service using Content-Encoding header", async ({
	expect,
}) => {
	const testBody = "x".repeat(100);
	const { http } = await useServer((req, res) => {
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
	useDispose(mf);

	const testEncoding = async (encoding: string) => {
		const res = await mf.dispatchFetch("http://localhost", {
			headers: {
				"Accept-Encoding": encoding,
				"X-Test-Encoding": encoding,
			},
		});
		expect(await res.text()).toBe(testBody);
		// This header is mostly just for this test -- but is an indication for anyone who wants to know if the response _was_ compressed
		// Expected the response, before decoding, to be encoded as ${encoding}
		expect(res.headers.get("MF-Content-Encoding")).toBe(encoding);
		// Ensure this header has been removed -- undici.fetch has already decoded (decompressed) the response
		// Expected Content-Encoding header to be removed
		expect(res.headers.get("Content-Encoding")).toBe(null);
	};

	await testEncoding("gzip");
	await testEncoding("deflate");
	await testEncoding("br");
	// `undici`'s `fetch()` is currently broken when `Content-Encoding` specifies
	// multiple encodings. Once https://github.com/nodejs/undici/pull/2159 is
	// released, we can re-enable this test.
	// TODO(soon): re-enable this test
	// await test("deflate, gzip");
});

test("Miniflare: negotiates acceptable encoding", async ({ expect }) => {
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
	useDispose(mf);

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
	expect(await res.json()).toEqual({
		AcceptEncoding: "br, gzip",
		clientAcceptEncoding: "hello",
	});

	// Check all encodings supported
	res = await fetch(gzipUrl);
	expect(await res.text()).toBe(testBody);
	res = await fetch(brUrl);
	expect(await res.text()).toBe(testBody);
	res = await fetch(deflateUrl);
	expect(await res.text()).toBe(testBody);

	// Check with `Accept-Encoding: gzip`
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "gzip" } });
	expect(res.headers.get("Content-Encoding")).toBe("gzip");
	expect(await res.text()).toBe(testBody);
	res = await fetch(brUrl, { headers: { "Accept-Encoding": "gzip" } });
	expect(res.headers.get("Content-Encoding")).toBe("gzip");
	expect(await res.text()).toBe(testBody);
	// "deflate" isn't an accepted encoding inside Workers, so returned as is
	res = await fetch(deflateUrl, { headers: { "Accept-Encoding": "gzip" } });
	expect(res.headers.get("Content-Encoding")).toBe("deflate");
	expect(await res.text()).toBe(testBody);

	// Check with `Accept-Encoding: br`
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "br" } });
	expect(res.headers.get("Content-Encoding")).toBe("br");
	expect(await res.text()).toBe(testBody);
	res = await fetch(brUrl, { headers: { "Accept-Encoding": "br" } });
	expect(res.headers.get("Content-Encoding")).toBe("br");
	expect(await res.text()).toBe(testBody);
	// "deflate" isn't an accepted encoding inside Workers, so returned as is
	res = await fetch(deflateUrl, { headers: { "Accept-Encoding": "br" } });
	expect(res.headers.get("Content-Encoding")).toBe("deflate");
	expect(await res.text()).toBe(testBody);

	// Check with mixed `Accept-Encoding`
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "gzip, br" } });
	expect(res.headers.get("Content-Encoding")).toBe("gzip");
	expect(await res.text()).toBe(testBody);
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "br, gzip" } });
	expect(res.headers.get("Content-Encoding")).toBe("br");
	expect(await res.text()).toBe(testBody);
	res = await fetch(gzipUrl, {
		headers: { "Accept-Encoding": "br;q=0.5, gzip" },
	});
	expect(res.headers.get("Content-Encoding")).toBe("gzip");
	expect(await res.text()).toBe(testBody);

	// Check empty `Accept-Encoding`
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "" } });
	expect(res.headers.get("Content-Encoding")).toBe("gzip");
	expect(await res.text()).toBe(testBody);

	// Check identity encoding
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "identity" } });
	expect(res.headers.get("Content-Encoding")).toBe(null);
	expect(await res.text()).toBe(testBody);
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "*" } });
	expect(res.headers.get("Content-Encoding")).toBe(null);
	expect(await res.text()).toBe(testBody);
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "zstd, *" } });
	expect(res.headers.get("Content-Encoding")).toBe(null);
	expect(await res.text()).toBe(testBody);
	res = await fetch(gzipUrl, {
		headers: { "Accept-Encoding": "zstd, identity;q=0" },
	});
	expect(res.status).toBe(415);
	expect(res.headers.get("Accept-Encoding")).toBe("br, gzip");
	expect(await res.text()).toBe("Unsupported Media Type");
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": "zstd, *;q=0" } });
	expect(res.status).toBe(415);
	expect(res.headers.get("Accept-Encoding")).toBe("br, gzip");
	expect(await res.text()).toBe("Unsupported Media Type");

	// Check malformed `Accept-Encoding`
	res = await fetch(gzipUrl, { headers: { "Accept-Encoding": ",(,br,,,q=," } });
	expect(res.headers.get("Content-Encoding")).toBe("br");
	expect(await res.text()).toBe(testBody);

	// Check `Content-Type: text/html` is compressed (FL always compresses html)
	res = await fetch(defaultCompressedUrl);
	expect(res.headers.get("Content-Type")).toBe("text/html");
	expect(res.headers.get("Content-Encoding")).toBe("gzip");
	expect(await res.text()).toBe(testBody);

	// Check `Content-Type: text/event-stream` is not compressed (FL does not compress this mime type)
	res = await fetch(defaultUncompressedUrl);
	expect(res.headers.get("Content-Type")).toBe("text/event-stream");
	expect(res.headers.get("Content-Encoding")).toBe(null);
	expect(await res.text()).toBe(testBody);
});

test("Miniflare: custom service using Set-Cookie header", async ({
	expect,
}) => {
	const testCookies = [
		"key1=value1; Max-Age=3600",
		"key2=value2; Domain=example.com; Secure",
	];
	const { http } = await useServer((req, res) => {
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
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.json()).toEqual(testCookies);
});

test("Miniflare: web socket kitchen sink", async ({ expect }) => {
	// Create deferred promises for asserting asynchronous event results
	const clientEventPromise = new DeferredPromise<MessageEvent>();
	const serverMessageEventPromise = new DeferredPromise<StandardMessageEvent>();
	const serverCloseEventPromise = new DeferredPromise<StandardCloseEvent>();

	// Create WebSocket origin server
	const server = http.createServer();
	const wss = new WebSocketServer({
		server,
		handleProtocols(protocols) {
			expect(protocols).toEqual(new Set(["protocol1", "protocol2"]));
			return "protocol2";
		},
	});
	wss.on("connection", (ws, req) => {
		// Testing receiving additional headers sent from upgrade request
		expect(req.headers["user-agent"]).toBe("Test");

		ws.send("hello from server");
		ws.addEventListener("message", serverMessageEventPromise.resolve);
		ws.addEventListener("close", serverCloseEventPromise.resolve);
	});
	wss.on("headers", (headers) => {
		headers.push("Set-Cookie: key=value");
	});
	const port = await new Promise<number>((resolve) => {
		server.listen(0, () => {
			onTestFinished(() => {
				server.close();
			});
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
				expect(request.cf?.country).toBe("MF");
				// Testing dispatchFetch injects default cf values
				expect(request.cf?.regionCode).toBe("TX");
				expect(request.headers.get("MF-Custom-Service")).toBe(null);
				// Testing WebSocket-upgrading fetch
				return fetch(`http://localhost:${port}`, request);
			},
		},
	});
	useDispose(mf);

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
	expect(res.headers.get("Set-Cookie")).toBe("key=value");
	expect(res.headers.get("Sec-WebSocket-Protocol")).toBe("protocol2");

	// Check event results
	const clientEvent = await clientEventPromise;
	const serverMessageEvent = await serverMessageEventPromise;
	const serverCloseEvent = await serverCloseEventPromise;
	expect(clientEvent.data).toBe("hello from server");
	expect(serverMessageEvent.data).toBe("hello from client");
	expect(serverCloseEvent.code).toBe(1000);
	expect(serverCloseEvent.reason).toBe("Test Closure");
});

test("Miniflare: custom service binding to another Miniflare instance", async ({
	expect,
}) => {
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
	useDispose(mfOther);

	const mf = new Miniflare({
		script: `addEventListener("fetch", (event) => {
			event.respondWith(CUSTOM.fetch(event.request));
		})`,
		serviceBindings: {
			async CUSTOM(request) {
				// Check internal keys removed (e.g. `MF-Custom-Service`, `MF-Original-URL`)
				// https://github.com/cloudflare/miniflare/issues/475
				const keys = [...request.headers.keys()];
				expect(
					keys.filter((key) => key.toLowerCase().startsWith("mf-"))
				).toEqual([]);

				return await mfOther.dispatchFetch(request);
			},
		},
	});
	useDispose(mf);

	// Checking URL (including protocol/host) and body preserved through
	// `dispatchFetch()` and custom service bindings
	let res = await mf.dispatchFetch("https://custom1.mf/a?key=value");
	expect(await res.json()).toEqual({
		method: "GET",
		url: "https://custom1.mf/a?key=value",
		body: null,
	});

	res = await mf.dispatchFetch("https://custom2.mf/b", {
		method: "POST",
		body: "body",
	});
	expect(await res.json()).toEqual({
		method: "POST",
		url: "https://custom2.mf/b",
		body: "body",
	});

	// https://github.com/cloudflare/miniflare/issues/476
	res = await mf.dispatchFetch("https://custom3.mf/c", { method: "DELETE" });
	expect(await res.json()).toEqual({
		method: "DELETE",
		url: "https://custom3.mf/c",
		body: null,
	});
});
test("Miniflare: service binding to current worker", async ({ expect }) => {
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
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("body:callback");
});
test("Miniflare: service binding to network", async ({ expect }) => {
	const { http } = await useServer((req, res) => res.end("network"));
	const mf = new Miniflare({
		serviceBindings: { NETWORK: { network: { allow: ["private"] } } },
		modules: true,
		script: `export default {
			fetch(request, env) { return env.NETWORK.fetch(request); }
		}`,
	});
	useDispose(mf);

	const res = await mf.dispatchFetch(http);
	expect(await res.text()).toBe("network");
});
test("Miniflare: service binding to external server", async ({ expect }) => {
	const { http } = await useServer((req, res) => res.end("external"));
	const mf = new Miniflare({
		serviceBindings: {
			EXTERNAL: { external: { address: http.host, http: {} } },
		},
		modules: true,
		script: `export default {
			fetch(request, env) { return env.EXTERNAL.fetch(request); }
		}`,
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("https://example.com");
	expect(await res.text()).toBe("external");
});
test("Miniflare: service binding to disk", async ({ expect }) => {
	const tmp = await useTmp();
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
	useDispose(mf);

	let res = await mf.dispatchFetch("https://example.com/test.txt");
	expect(await res.text()).toBe("👋");

	res = await mf.dispatchFetch("https://example.com/test.txt", {
		method: "PUT",
		body: "✏️",
	});
	expect(res.status).toBe(204);
	expect(await fs.readFile(testPath, "utf8")).toBe("✏️");
});
test("Miniflare: service binding to named entrypoint", async ({ expect }) => {
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
	useDispose(mf);

	const res = await mf.dispatchFetch("http://placeholder");
	expect(await res.json()).toEqual({
		aRpc: "a:rpc:pong",
		aNamed: "a:named:pong",
		bNamed: "b:named:pong",
	});
});

test("Miniflare: service binding to named entrypoint that implements a method returning a plain object", async ({
	expect,
}) => {
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
	useDispose(mf);

	const bindings = await mf.getBindings<{ RPC_SERVICE: any }>();
	const o = await bindings.RPC_SERVICE.getObject();
	expect(o.isPlainObject).toEqual(true);
	expect(o.value).toEqual(123);
});

test("Miniflare: service binding to named entrypoint that implements a method returning an RpcTarget instance", async ({
	expect,
}) => {
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
	useDispose(mf);

	const bindings = await mf.getBindings<{ RPC_SERVICE: any }>();
	const rpcTarget = await bindings.RPC_SERVICE.getRpcTarget();
	expect(rpcTarget.id).toEqual("test-id");
});

test("Miniflare: tail consumer called", async ({ expect }) => {
	const mf = new Miniflare({
		handleRuntimeStdio: () => {},
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
						console.log("Tail: log event")

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
	useDispose(mf);

	const res = await mf.dispatchFetch("http://placeholder");
	expect(await res.text()).toEqual("hello from a");
	expect(
		(
			(await (await mf.dispatchFetch("http://placeholder/b")).json()) as {
				logs: { message: string[] }[];
			}[]
		)[0].logs[0].message
	).toEqual(["Tail: log event"]);
});

test("Miniflare: custom outbound service", async ({ expect }) => {
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
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.json()).toEqual({
		res1: "one",
		res2: "fallback:https://example.com/2",
	});
});

test("Miniflare: can send GET request with body", async ({ expect }) => {
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
	useDispose(mf);

	// Can't use `dispatchFetch()` here as `fetch()` prohibits `GET` requests
	// with bodies/`Content-Length: 0` headers
	const url = await mf.ready;
	function get(opts: http.RequestOptions = {}): Promise<http.IncomingMessage> {
		return new Promise((resolve, reject) => {
			http.get(url, opts, resolve).on("error", reject);
		});
	}

	let res = await get();
	expect(await json(res)).toEqual({
		cf: { key: "value", clientAcceptEncoding: "" },
		contentLength: null,
		hasBody: false,
	});

	res = await get({ headers: { "content-length": "0" } });
	expect(await json(res)).toEqual({
		cf: { key: "value", clientAcceptEncoding: "" },
		contentLength: "0",
		hasBody: true,
	});
});

test("Miniflare: handles redirect responses", async ({ expect }) => {
	// https://github.com/cloudflare/workers-sdk/issues/5018

	const { http } = await useServer((req, res) => {
		// Check no special headers set
		const headerKeys = Object.keys(req.headers);
		expect(
			headerKeys.filter((key) => key.toLowerCase().startsWith("mf-"))
		).toEqual([]);

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
	useDispose(mf);

	// Check relative redirect
	let res = await mf.dispatchFetch("https://custom.mf/redirect-relative", {
		redirect: "manual",
	});
	expect(res.status).toBe(302);
	expect(res.headers.get("Location")).toBe("/relative-redirected");
	await res.arrayBuffer(); // (drain)

	res = await mf.dispatchFetch("https://custom.mf/redirect-relative");
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("end:https://custom.mf/relative-redirected");

	// Check absolute redirect to same origin
	res = await mf.dispatchFetch("https://custom.mf/redirect-absolute", {
		redirect: "manual",
	});
	expect(res.status).toBe(302);
	expect(res.headers.get("Location")).toBe(
		"https://custom.mf/absolute-redirected"
	);
	await res.arrayBuffer(); // (drain)

	res = await mf.dispatchFetch("https://custom.mf/redirect-absolute");
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("end:https://custom.mf/absolute-redirected");

	// Check absolute redirect to external origin
	res = await mf.dispatchFetch("https://custom.mf/redirect-external", {
		redirect: "manual",
	});
	expect(res.status).toBe(302);
	expect(res.headers.get("Location")).toBe(new URL("/ping", http).href);
	await res.arrayBuffer(); // (drain)

	res = await mf.dispatchFetch("https://custom.mf/redirect-external");
	expect(res.status).toBe(200);
	expect(await res.text()).toBe("pong");

	// Check absolute redirect to external origin, then redirect back to initial
	res = await mf.dispatchFetch("https://custom.mf/redirect-external-and-back", {
		redirect: "manual",
	});
	expect(res.status).toBe(302);
	expect(res.headers.get("Location")).toBe(
		new URL("/redirect-back", http).href
	);
	await res.arrayBuffer(); // (drain)

	res = await mf.dispatchFetch("https://custom.mf/redirect-external-and-back");
	expect(res.status).toBe(200);
	// External server redirects back to worker running in `workerd`
	expect(await res.text()).toBe("end:https://custom.mf/external-redirected");
});

test("Miniflare: fetch mocking", async ({ expect }) => {
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
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("Mocked response!");

	// Check `outboundService`and `fetchMock` mutually exclusive
	await expect(
		mf.setOptions({
			script: "",
			fetchMock,
			outboundService: "",
		})
	).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_MULTIPLE_OUTBOUNDS",
			"Only one of `outboundService` or `fetchMock` may be specified per worker"
		)
	);
});
test("Miniflare: custom upstream as origin (with colons)", async ({
	expect,
}) => {
	const upstream = await useServer((req, res) => {
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
	useDispose(mf);
	// Check rewrites protocol, hostname, and port, but keeps pathname and query
	const res = await mf.dispatchFetch("https://random:0/path:path?a=1");
	expect(await res.text()).toBe(
		"upstream: http://upstream/extra:extra/path:path?a=1"
	);
});
test("Miniflare: custom upstream as origin", async ({ expect }) => {
	const upstream = await useServer((req, res) => {
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
	useDispose(mf);
	// Check rewrites protocol, hostname, and port, but keeps pathname and query
	const res = await mf.dispatchFetch("https://random:0/path?a=1");
	expect(await res.json()).toEqual({
		resp: "upstream: http://upstream/extra/path?a=1",
		host: upstream.http.host,
	});
});
test("Miniflare: custom upstream sets MF-Original-Hostname header", async ({
	expect,
}) => {
	const upstream = await useServer((req, res) => {
		res.end(`upstream`);
	});
	const mf = new Miniflare({
		upstream: upstream.http.toString(),
		modules: true,
		script: `export default {
			async fetch(request) {
				return Response.json({
					host: request.headers.get("Host"),
					originalHostname: request.headers.get("MF-Original-Hostname")
				});
			}
		}`,
	});
	useDispose(mf);
	// Check that original hostname is preserved when using upstream
	const res = await mf.dispatchFetch(
		"https://my-original-host.example.com:8080/path?a=1"
	);
	expect(await res.json()).toEqual({
		host: upstream.http.host,
		originalHostname: "my-original-host.example.com:8080",
	});
});
test("Miniflare: MF-Original-Hostname header not set without upstream", async ({
	expect,
}) => {
	const mf = new Miniflare({
		modules: true,
		script: `export default {
			async fetch(request) {
				return Response.json({
					originalHostname: request.headers.get("MF-Original-Hostname")
				});
			}
		}`,
	});
	useDispose(mf);
	// Check that original hostname header is not set when not using upstream
	const res = await mf.dispatchFetch("https://random:0/path?a=1");
	expect(await res.json()).toEqual({
		originalHostname: null,
	});
});
test("Miniflare: set origin to original URL if proxy shared secret matches", async ({
	expect,
}) => {
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
	useDispose(mf);

	const res = await mf.dispatchFetch("https://random:0/path?a=1", {
		headers: { "MF-Proxy-Shared-Secret": "SOME_PROXY_SHARED_SECRET_VALUE" },
	});
	expect(await res.json()).toEqual({
		host: "random:0",
	});
});
test("Miniflare: keep origin as listening host if proxy shared secret not provided", async ({
	expect,
}) => {
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
	useDispose(mf);

	const res = await mf.dispatchFetch("https://random:0/path?a=1");
	expect(await res.json()).toEqual({
		host: (await mf.ready).host,
	});
});
test("Miniflare: 400 error on proxy shared secret header when not configured", async ({
	expect,
}) => {
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
	useDispose(mf);

	const res = await mf.dispatchFetch("https://random:0/path?a=1", {
		headers: { "MF-Proxy-Shared-Secret": "SOME_PROXY_SHARED_SECRET_VALUE" },
	});
	expect(res.status).toBe(400);
	expect(await res.text()).toBe(
		"Disallowed header in request: MF-Proxy-Shared-Secret=SOME_PROXY_SHARED_SECRET_VALUE"
	);
});
test("Miniflare: 400 error on proxy shared secret header mismatch with configuration", async ({
	expect,
}) => {
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
	useDispose(mf);

	const res = await mf.dispatchFetch("https://random:0/path?a=1", {
		headers: { "MF-Proxy-Shared-Secret": "BAD_PROXY_SHARED_SECRET" },
	});
	expect(res.status).toBe(400);
	expect(await res.text()).toBe(
		"Disallowed header in request: MF-Proxy-Shared-Secret=BAD_PROXY_SHARED_SECRET"
	);
});

test("Miniflare: `node:`, `cloudflare:` and `workerd:` modules", async ({
	expect,
}) => {
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
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("dGVzdA==");
});

test("Miniflare: modules in sub-directories", async ({ expect }) => {
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
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("123");
});

test("Miniflare: python modules", async ({ expect }) => {
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
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("4");
});

test("Miniflare: HTTPS fetches using browser CA certificates", async ({
	expect,
}) => {
	const mf = new Miniflare({
		modules: true,
		script: `export default {
			fetch() {
				return fetch("https://workers.cloudflare.com/cf.json");
			}
		}`,
	});
	useDispose(mf);
	const res = await mf.dispatchFetch("http://localhost");
	expect(res.ok).toBe(true);
	await res.arrayBuffer(); // (drain)
});

test("Miniflare: accepts https requests", async ({ expect }) => {
	const log = new TestLog();

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
	useDispose(mf);

	const res = await mf.dispatchFetch("https://localhost");
	expect(res.ok).toBe(true);
	await res.arrayBuffer(); // (drain)

	expect(log.logs[0][1].startsWith("Ready on https://"));
});

// Regression test for https://github.com/cloudflare/workers-sdk/issues/9357
test("Miniflare: throws error messages that reflect the actual issue", async ({
	expect,
}) => {
	const log = new TestLog();

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
	useDispose(mf);

	const res = await mf.dispatchFetch("https://localhost");
	expect(await res.text()).toMatch(
		/TypeError: Object\.defineProperty called on non-object/
	);
});

test("Miniflare: manually triggered scheduled events", async ({ expect }) => {
	const log = new TestLog();

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
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("false");

	res = await mf.dispatchFetch("http://localhost/cdn-cgi/handler/scheduled");
	expect(await res.text()).toBe("ok");

	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("true");
});

test("Miniflare: manually triggered email handler - valid email", async ({
	expect,
}) => {
	const log = new TestLog();

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
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("false");

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
	expect(await res.text()).toBe("Worker successfully processed email");
	expect(res.status).toBe(200);

	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("true");
});

test("Miniflare: manually triggered email handler - setReject does not throw", async ({
	expect,
}) => {
	const log = new TestLog();

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
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("false");

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
	expect(await res.text()).toBe(
		"Worker rejected email with the following reason: I just don't like this email :("
	);
	expect(res.status).toBe(400);

	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("true");
});

test("Miniflare: manually triggered email handler - forward does not throw", async ({
	expect,
}) => {
	const log = new TestLog();

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
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("false");

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
	expect(await res.text()).toBe("Worker successfully processed email");
	expect(res.status).toBe(200);

	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("true");
});

test("Miniflare: manually triggered email handler - invalid email, no message id", async ({
	expect,
}) => {
	const log = new TestLog();

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
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("false");

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
	expect(await res.text()).toBe(
		"Email could not be parsed: invalid or no message id provided"
	);
	expect(res.status).toBe(400);

	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("false");
});

test("Miniflare: manually triggered email handler - reply handler works", async ({
	expect,
}) => {
	const log = new TestLog();

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
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("false");

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
	expect(await res.text()).toBe("Worker successfully processed email");
	expect(res.status).toBe(200);

	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("true");
});

test("Miniflare: unimplemented /cdn-cgi/handler/ routes", async ({
	expect,
}) => {
	const mf = new Miniflare({
		modules: true,
		script: `
			export default {
				fetch() {
					return new Response("Hello world");
				}
			}
		`,
		unsafeTriggerHandlers: true,
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost/cdn-cgi/handler/foo");
	expect(await res.text()).toBe(
		`"/cdn-cgi/handler/foo" is not a valid handler. Did you mean to use "/cdn-cgi/handler/scheduled" or "/cdn-cgi/handler/email"?`
	);
	expect(res.status).toBe(404);
});

test("Miniflare: other /cdn-cgi/ routes", async ({ expect }) => {
	const mf = new Miniflare({
		modules: true,
		script: `
			export default {
				fetch() {
					return new Response("Hello world");
				}
			}
		`,
		unsafeTriggerHandlers: true,
	});
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost/cdn-cgi/foo");
	expect(await res.text()).toBe("Hello world");
	expect(res.status).toBe(200);
});

test("Miniflare: listens on ipv6", async ({ expect }) => {
	const log = new TestLog();

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
	useDispose(mf);

	const url = await mf.ready;

	let response = await fetch(`http://localhost:${url.port}`);
	expect(response.ok).toBe(true);

	response = await fetch(`http://[::1]:${url.port}`);
	expect(response.ok).toBe(true);

	response = await fetch(`http://127.0.0.1:${url.port}`);
	expect(response.ok).toBe(true);
});

test("Miniflare: dispose() immediately after construction", async ({
	expect,
}) => {
	const mf = new Miniflare({ script: "", modules: true });
	const readyPromise = mf.ready;
	// Attach rejection handler BEFORE dispose() to prevent unhandled rejection
	const readyAssertion = expect(readyPromise).rejects.toThrow(
		new MiniflareCoreError("ERR_DISPOSED", "Cannot use disposed instance")
	);
	await mf.dispose();
	await readyAssertion;
});

test("Miniflare: getBindings() returns all bindings", async ({ expect }) => {
	const tmp = await useTmp();
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
	onTestFinished(() => {
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

	expect(bindings).toMatchObject({
		STRING: "hello",
		OBJECT: { a: 1, b: { c: 2 } },
		TEXT: "blob",
	});
	expect(bindings.DATA).toEqual(viewToBuffer(utf8Encode("blob")));

	const opts: util.InspectOptions = { colors: false };
	expect(util.inspect(bindings.SELF, opts)).toMatch(/name: 'Fetcher'/);
	expect(util.inspect(bindings.DB, opts)).toMatch(/name: 'D1Database'/);
	expect(util.inspect(bindings.DO, opts)).toMatch(
		/name: 'DurableObjectNamespace'/
	);
	expect(util.inspect(bindings.KV, opts)).toMatch(/name: 'KvNamespace'/);
	expect(util.inspect(bindings.QUEUE, opts)).toMatch(/name: 'WorkerQueue'/);
	expect(util.inspect(bindings.BUCKET, opts)).toMatch(/name: 'R2Bucket'/);

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
	expect((instance.exports.add as (a: number, b: number) => number)(1, 2)).toBe(
		3
	);

	// Check bindings poisoned after dispose
	await mf.dispose();
	disposed = true;
	expect(() => bindings.KV.get("key")).toThrow(
		new Error(
			"Attempted to use poisoned stub. Stubs to runtime objects must be re-created after calling `Miniflare#setOptions()` or `Miniflare#dispose()`."
		)
	);
});
test("Miniflare: getBindings() returns wrapped bindings", async ({
	expect,
}) => {
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
	useDispose(mf);

	interface Env {
		Greeter: {
			sayHello: (str: string) => string;
		};
	}
	const { Greeter } = await mf.getBindings<Env>();

	const helloWorld = Greeter.sayHello("World");

	expect(helloWorld).toBe("Hello World");
});
test("Miniflare: getBindings() handles wrapped bindings returning objects containing functions", async ({
	expect,
}) => {
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
	useDispose(mf);

	interface Env {
		Greeter: {
			greeting: string;
			sayHello: (str: string) => string;
		};
	}
	const { Greeter } = await mf.getBindings<Env>();

	const helloWorld = Greeter.sayHello("World");

	expect(helloWorld).toBe("Hello World");
	expect(Greeter.greeting).toBe("Hello");
});
test("Miniflare: getBindings() handles wrapped bindings returning objects containing nested functions", async ({
	expect,
}) => {
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
	useDispose(mf);

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

	expect(helloWorld).toBe("Hello World from a nested function");
});
test("Miniflare: getBindings() handles wrapped bindings returning functions returning functions", async ({
	expect,
}) => {
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
	useDispose(mf);

	interface Env {
		GreetFactory: {
			greeting: string;
			getGreetFunction: () => (str: string) => string;
		};
	}
	const { GreetFactory } = await mf.getBindings<Env>();

	const greetFunction = GreetFactory.getGreetFunction();

	expect(greetFunction("Esteemed World")).toBe("Salutations Esteemed World");
	expect(GreetFactory.greeting).toBe("Salutations");
});
test("Miniflare: getWorker() allows dispatching events directly", async ({
	expect,
}) => {
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
	useDispose(mf);
	const fetcher = await mf.getWorker();

	// Check `Fetcher#scheduled()` (implicitly testing `Fetcher#fetch()`)
	let scheduledResult = await fetcher.scheduled({
		cron: "* * * * *",
	});
	expect(scheduledResult).toEqual({ outcome: "ok", noRetry: true });
	scheduledResult = await fetcher.scheduled({
		scheduledTime: new Date(1000),
		cron: "30 * * * *",
	});
	expect(scheduledResult).toEqual({ outcome: "ok", noRetry: false });

	let res = await fetcher.fetch("http://localhost/scheduled");
	const scheduledController = await res.json();
	expect(scheduledController).toEqual({
		scheduledTime: 1000,
		cron: "30 * * * *",
	});

	// Check `Fetcher#queue()`
	let queueResult = await fetcher.queue("needy", [
		{ id: "a", timestamp: new Date(1000), body: "a", attempts: 1 },
		{ id: "b", timestamp: new Date(2000), body: { b: 1 }, attempts: 1 },
	]);
	expect(queueResult).toEqual({
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
	expect(queueResult).toEqual({
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
	expect(queueBatch).toEqual({
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
	expect(await res.text()).toBe("https://dummy:1234/get-url");
});
test("Miniflare: getBindings() and friends return bindings for different workers", async ({
	expect,
}) => {
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
	useDispose(mf);

	// Check `getBindings()`
	let bindings = await mf.getBindings();
	expect(Object.keys(bindings)).toEqual(["DB", "DO"]);
	bindings = await mf.getBindings("");
	expect(Object.keys(bindings)).toEqual(["KV", "QUEUE"]);
	bindings = await mf.getBindings("b");
	expect(Object.keys(bindings)).toEqual(["BUCKET"]);
	await expect(() => mf.getBindings("c")).rejects.toThrow(
		new TypeError('"c" worker not found')
	);

	// Check `getWorker()`
	let fetcher = await mf.getWorker();
	expect(await (await fetcher.fetch("http://localhost")).text()).toBe("a");
	fetcher = await mf.getWorker("");
	expect(await (await fetcher.fetch("http://localhost")).text()).toBe(
		"unnamed"
	);
	fetcher = await mf.getWorker("b");
	expect(await (await fetcher.fetch("http://localhost")).text()).toBe("b");
	await expect(() => mf.getWorker("c")).rejects.toThrow(
		new TypeError('"c" worker not found')
	);

	// Check `getD1Database()`
	let binding: unknown = await mf.getD1Database("DB");
	expect(binding).toBeDefined();
	await expect(() => mf.getD1Database("DB", "c")).rejects.toThrow(
		new TypeError(`"DB" unbound in "c" worker`)
	);

	// Check `getDurableObjectNamespace()`
	binding = await mf.getDurableObjectNamespace("DO");
	expect(binding).toBeDefined();
	await expect(() => mf.getDurableObjectNamespace("DO", "c")).rejects.toThrow(
		new TypeError(`"DO" unbound in "c" worker`)
	);

	// Check `getKVNamespace()`
	binding = await mf.getKVNamespace("KV", "");
	expect(binding).toBeDefined();
	await expect(() => mf.getKVNamespace("KV", "c")).rejects.toThrow(
		new TypeError(`"KV" unbound in "c" worker`)
	);

	// Check `getQueueProducer()`
	binding = await mf.getQueueProducer("QUEUE", "");
	expect(binding).toBeDefined();
	await expect(() => mf.getQueueProducer("QUEUE", "c")).rejects.toThrow(
		new TypeError(`"QUEUE" unbound in "c" worker`)
	);

	// Check `getR2Bucket()`
	binding = await mf.getR2Bucket("BUCKET", "b");
	expect(binding).toBeDefined();
	await expect(() => mf.getR2Bucket("BUCKET", "c")).rejects.toThrow(
		new TypeError(`"BUCKET" unbound in "c" worker`)
	);
});

test("Miniflare: allows direct access to workers", async ({ expect }) => {
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
	useDispose(mf);

	// Check can access workers as usual
	let res = await mf.dispatchFetch("http://localhost/");
	expect(await res.text()).toBe("b");

	// Check can access workers directly
	// (`undefined` worker name should default to entrypoint, not unnamed worker)
	const aURL = await mf.unsafeGetDirectURL();
	const cURL = await mf.unsafeGetDirectURL("c");
	res = await fetch(aURL);
	expect(await res.text()).toBe("a");
	res = await fetch(cURL);
	expect(await res.text()).toBe("c");

	// Check can access workers directly with different entrypoints
	const d1URL = await mf.unsafeGetDirectURL("d", "One");
	const d2URL = await mf.unsafeGetDirectURL("d", "two");
	res = await fetch(d1URL);
	expect(await res.text()).toBe("d:1");
	res = await fetch(d2URL);
	expect(await res.text()).toBe("d:2");

	// Can can only access configured for direct access
	await expect(mf.unsafeGetDirectURL("z")).rejects.toThrow(
		new TypeError('"z" worker not found')
	);
	await expect(mf.unsafeGetDirectURL("")).rejects.toThrow(
		new TypeError('Direct access disabled in "" worker for default entrypoint')
	);
	await expect(mf.unsafeGetDirectURL("d", "three")).rejects.toThrow(
		new TypeError('Direct access disabled in "d" worker for "three" entrypoint')
	);
});
test("Miniflare: allows RPC between multiple instances", async ({ expect }) => {
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
	useDispose(mf1);

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
	useDispose(mf2);

	const res = await mf2.dispatchFetch("http://placeholder");
	expect(await res.text()).toBe("pong");
});

// Only test `MINIFLARE_WORKERD_PATH` on Unix. The test uses a Node.js script
// with a shebang, directly as the replacement `workerd` binary, which won't
// work on Windows.
const isWindows = process.platform === "win32";
const unixSerialTest = isWindows ? test.skip : test.sequential;
unixSerialTest(
	"Miniflare: MINIFLARE_WORKERD_PATH overrides workerd path",
	async ({ expect }) => {
		const workerdPath = path.join(FIXTURES_PATH, "little-workerd.mjs");

		const original = process.env.MINIFLARE_WORKERD_PATH;
		process.env.MINIFLARE_WORKERD_PATH = workerdPath;
		onTestFinished(() => {
			// Setting key/values pairs on `process.env` coerces values to strings
			if (original === undefined) delete process.env.MINIFLARE_WORKERD_PATH;
			else process.env.MINIFLARE_WORKERD_PATH = original;
		});

		const mf = new Miniflare({ script: "" });
		useDispose(mf);

		const res = await mf.dispatchFetch("http://localhost");
		expect(await res.text()).toBe(
			"When I grow up, I want to be a big workerd!"
		);
	}
);

test("Miniflare: exits cleanly", async ({ expect }) => {
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
	expect(message).toBe("body");

	// Check exit doesn't output anything
	const closePromise = once(result, "close");
	result.kill("SIGINT");
	assert(result.stdout !== null && result.stderr !== null);
	const stdout = await text(result.stdout);
	const stderr = await text(result.stderr);
	await closePromise;
	expect(stdout).toBe("");
	expect(stderr).toBe("");
});

test("Miniflare: supports unsafe eval bindings", async ({ expect }) => {
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
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost");
	expect(response.ok).toBe(true);
	expect(await response.text()).toBe("the computed value is 3");
});

test("Miniflare: supports wrapped bindings", async ({ expect }) => {
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
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost/");
	expect(await res.json()).toEqual({ value: "value", emptyValue: null });
	expect(store).toEqual(new Map([["ns:key", "another value"]]));
});
test("Miniflare: check overrides default bindings with bindings from wrapped binding designator", async ({
	expect,
}) => {
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
	useDispose(mf);

	const res = await mf.dispatchFetch("http://localhost/");
	expect(await res.json()).toEqual({ A: "default a", B: "overridden b" });
});
test("Miniflare: checks uses compatibility and outbound configuration of binder", async ({
	expect,
}) => {
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
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost/");
	expect(await res.json()).toEqual({
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
	expect(await res.json()).toEqual({
		typeofNavigator: "undefined",
		importedNode: false,
		outboundText: "mocked",
	});
});
test("Miniflare: cannot call getWorker() on wrapped binding worker", async ({
	expect,
}) => {
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
	useDispose(mf);

	await expect(mf.getWorker("binding")).rejects.toThrow(
		new TypeError(
			'"binding" is being used as a wrapped binding, and cannot be accessed as a worker'
		)
	);
});
test("Miniflare: prohibits invalid wrapped bindings", async ({ expect }) => {
	const mf = new Miniflare({ modules: true, script: "" });
	useDispose(mf);

	// Check prohibits using entrypoint worker
	await expect(
		mf.setOptions({
			name: "a",
			modules: true,
			script: "",
			wrappedBindings: {
				WRAPPED: { scriptName: "a", entrypoint: "wrapped" },
			},
		})
	).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_INVALID_WRAPPED",
			'Cannot use "a" for wrapped binding because it\'s the entrypoint.\n' +
				'Ensure "a" isn\'t the first entry in the `workers` array.'
		)
	);

	// Check prohibits using service worker
	await expect(
		mf.setOptions({
			workers: [
				{ modules: true, script: "", wrappedBindings: { WRAPPED: "binding" } },
				{ name: "binding", script: "" },
			],
		})
	).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_INVALID_WRAPPED",
			'Cannot use "binding" for wrapped binding because it\'s a service worker.\n' +
				'Ensure "binding" sets `modules` to `true` or an array of modules'
		)
	);

	// Check prohibits multiple modules
	await expect(
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
		})
	).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_INVALID_WRAPPED",
			'Cannot use "binding" for wrapped binding because it isn\'t a single module.\n' +
				'Ensure "binding" doesn\'t include unbundled `import`s.'
		)
	);

	// Check prohibits non-ES-modules
	await expect(
		mf.setOptions({
			workers: [
				{ modules: true, script: "", wrappedBindings: { WRAPPED: "binding" } },
				{
					name: "binding",
					modules: [{ type: "CommonJS", path: "index.cjs", contents: "" }],
				},
			],
		})
	).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_INVALID_WRAPPED",
			'Cannot use "binding" for wrapped binding because it isn\'t a single ES module'
		)
	);

	// Check prohibits Durable Object bindings
	await expect(
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
		})
	).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_INVALID_WRAPPED",
			'Cannot use "binding" for wrapped binding because it is bound to with Durable Object bindings.\n' +
				'Ensure other workers don\'t define Durable Object bindings to "binding".'
		)
	);

	// Check prohibits service bindings
	await expect(
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
		})
	).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_INVALID_WRAPPED",
			'Cannot use "binding" for wrapped binding because it is bound to with service bindings.\n' +
				'Ensure other workers don\'t define service bindings to "binding".'
		)
	);

	// Check prohibits compatibility date and flags
	await expect(
		mf.setOptions({
			workers: [
				{ modules: true, script: "", wrappedBindings: { WRAPPED: "binding" } },
				{
					name: "binding",
					compatibilityDate: "2023-11-01",
					modules: [{ type: "ESModule", path: "index.mjs", contents: "" }],
				},
			],
		})
	).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_INVALID_WRAPPED",
			'Cannot use "binding" for wrapped binding because it defines a compatibility date.\n' +
				"Wrapped bindings use the compatibility date of the worker with the binding."
		)
	);
	await expect(
		mf.setOptions({
			workers: [
				{ modules: true, script: "", wrappedBindings: { WRAPPED: "binding" } },
				{
					name: "binding",
					compatibilityFlags: ["nodejs_compat"],
					modules: [{ type: "ESModule", path: "index.mjs", contents: "" }],
				},
			],
		})
	).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_INVALID_WRAPPED",
			'Cannot use "binding" for wrapped binding because it defines compatibility flags.\n' +
				"Wrapped bindings use the compatibility flags of the worker with the binding."
		)
	);

	// Check prohibits outbound service
	await expect(
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
		})
	).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_INVALID_WRAPPED",
			'Cannot use "binding" for wrapped binding because it defines an outbound service.\n' +
				"Wrapped bindings use the outbound service of the worker with the binding."
		)
	);

	// Check prohibits cyclic wrapped bindings
	await expect(
		mf.setOptions({
			workers: [
				{ modules: true, script: "", wrappedBindings: { WRAPPED: "binding" } },
				{
					name: "binding",
					wrappedBindings: { WRAPPED: "binding" }, // Simple cycle
					modules: [{ type: "ESModule", path: "index.mjs", contents: "" }],
				},
			],
		})
	).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_CYCLIC",
			"Generated workerd config contains cycles. Ensure wrapped bindings don't have bindings to themselves."
		)
	);
	await expect(
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
		})
	).rejects.toThrow(
		new MiniflareCoreError(
			"ERR_CYCLIC",
			"Generated workerd config contains cycles. Ensure wrapped bindings don't have bindings to themselves."
		)
	);
});

test("Miniflare: getCf() returns a standard cf object", async ({ expect }) => {
	const mf = new Miniflare({ script: "", modules: true });
	useDispose(mf);

	const cf = await mf.getCf();
	expect(cf).toMatchObject({
		colo: "DFW",
		city: "Austin",
		regionCode: "TX",
	});
});

test("Miniflare: getCf() returns a user provided cf object", async ({
	expect,
}) => {
	const mf = new Miniflare({
		script: "",
		modules: true,
		cf: {
			myFakeField: "test",
		},
	});
	useDispose(mf);

	const cf = await mf.getCf();
	expect(cf).toEqual({ myFakeField: "test" });
});

test("Miniflare: dispatchFetch() can override cf", async ({ expect }) => {
	const mf = new Miniflare({
		script:
			"export default { fetch(request) { return Response.json(request.cf) } }",
		modules: true,
		cf: {
			myFakeField: "test",
		},
	});
	useDispose(mf);

	const cf = await mf.dispatchFetch("http://example.com/", {
		cf: { myFakeField: "test2" },
	});
	const cfJson = (await cf.json()) as { myFakeField: string };
	expect(cfJson.myFakeField).toEqual("test2");
});

test("Miniflare: CF-Connecting-IP is injected", async ({ expect }) => {
	const mf = new Miniflare({
		script:
			"export default { fetch(request) { return new Response(request.headers.get('CF-Connecting-IP')) } }",
		modules: true,
		cf: {
			myFakeField: "test",
		},
	});
	useDispose(mf);

	const ip = await mf.dispatchFetch("http://example.com/");
	// Tracked in https://github.com/cloudflare/workerd/issues/3310
	if (!isWindows) {
		expect(await ip.text()).toEqual("127.0.0.1");
	} else {
		expect(await ip.text()).toEqual("");
	}
});

test("Miniflare: CF-Connecting-IP is injected (ipv6)", async ({ expect }) => {
	const mf = new Miniflare({
		script:
			"export default { fetch(request) { return new Response(request.headers.get('CF-Connecting-IP')) } }",
		modules: true,
		cf: {
			myFakeField: "test",
		},
		host: "::1",
	});
	useDispose(mf);

	const ip = await mf.dispatchFetch("http://example.com/");

	// Tracked in https://github.com/cloudflare/workerd/issues/3310
	if (!isWindows) {
		expect(await ip.text()).toEqual("::1");
	} else {
		expect(await ip.text()).toEqual("");
	}
});

test("Miniflare: CF-Connecting-IP is preserved when present", async ({
	expect,
}) => {
	const mf = new Miniflare({
		script:
			"export default { fetch(request) { return new Response(request.headers.get('CF-Connecting-IP')) } }",
		modules: true,
		cf: {
			myFakeField: "test",
		},
	});
	useDispose(mf);

	const ip = await mf.dispatchFetch("http://example.com/", {
		headers: {
			"CF-Connecting-IP": "128.0.0.1",
		},
	});
	expect(await ip.text()).toEqual("128.0.0.1");
});

// regression test for https://github.com/cloudflare/workers-sdk/issues/7924
// The "server" service just returns the value of the CF-Connecting-IP header which would normally be added by Miniflare. If you send a request to with no such header, Miniflare will add one.
// The "client" service makes an outbound request with a fake CF-Connecting-IP header to the "server" service. If the outbound stripping happens then this header will not make it to the "server" service
// so its response will contain the header added by Miniflare. If the stripping is turned off then the response from the "server" service will contain the fake header.
test("Miniflare: strips CF-Connecting-IP", async ({ expect }) => {
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
	useDispose(client);
	useDispose(server);

	const landingPage = await client.dispatchFetch("http://example.com/");
	// The CF-Connecting-IP header value of "fake-value" should be stripped by Miniflare, and should be replaced with a generic 127.0.0.1
	expect(await landingPage.text()).not.toEqual("fake-value");
});

test("Miniflare: does not strip CF-Connecting-IP when configured", async ({
	expect,
}) => {
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
	useDispose(client);
	useDispose(server);

	const landingPage = await client.dispatchFetch("http://example.com/");
	expect(await landingPage.text()).toEqual("fake-value");
});

// Test for https://github.com/cloudflare/workers-sdk/issues/4367
// The CF-Worker header should be added to outbound fetch requests to match production behavior
test("Miniflare: adds CF-Worker header to outbound requests with zone option", async ({
	expect,
}) => {
	const server = new Miniflare({
		script:
			"export default { fetch(request) { return new Response(request.headers.get(`CF-Worker`)) } }",
		modules: true,
	});
	const serverUrl = await server.ready;

	const client = new Miniflare({
		name: "my-worker",
		zone: "my-zone.example.com",
		script: `export default { fetch(request) { return fetch('${serverUrl.href}') } }`,
		modules: true,
	});
	useDispose(client);
	useDispose(server);

	const response = await client.dispatchFetch("http://example.com/");
	// The CF-Worker header should be set to the zone value when provided
	expect(await response.text()).toEqual("my-zone.example.com");
});

test("Miniflare: CF-Worker header defaults to worker-name.example.com when zone not set", async ({
	expect,
}) => {
	const server = new Miniflare({
		script:
			"export default { fetch(request) { return new Response(request.headers.get(`CF-Worker`)) } }",
		modules: true,
	});
	const serverUrl = await server.ready;

	const client = new Miniflare({
		name: "my-worker",
		// No zone set, should default to `${worker-name}.example.com`
		script: `export default { fetch(request) { return fetch('${serverUrl.href}') } }`,
		modules: true,
	});
	useDispose(client);
	useDispose(server);

	const response = await client.dispatchFetch("http://example.com/");
	// The CF-Worker header should default to `${worker-name}.example.com` when no zone is specified
	expect(await response.text()).toEqual("my-worker.example.com");
});

test("Miniflare: CF-Worker header defaults to worker.example.com when neither zone nor name set", async ({
	expect,
}) => {
	const server = new Miniflare({
		script:
			"export default { fetch(request) { return new Response(request.headers.get(`CF-Worker`)) } }",
		modules: true,
	});
	const serverUrl = await server.ready;

	const client = new Miniflare({
		// No name or zone set, should default to "worker.example.com"
		script: `export default { fetch(request) { return fetch('${serverUrl.href}') } }`,
		modules: true,
	});
	useDispose(client);
	useDispose(server);

	const response = await client.dispatchFetch("http://example.com/");
	// The CF-Worker header should default to "worker.example.com" when neither zone nor name is specified
	expect(await response.text()).toEqual("worker.example.com");
});

test("Miniflare: can use module fallback service", async ({ expect }) => {
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
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost/a");
	expect(await res.text()).toBe("acd");

	// Check fallback service ignored if not explicitly enabled
	res = await mf.dispatchFetch("http://localhost/b");
	expect(res.status).toBe(500);
	expect(await res.text()).toBe('Error: No such module "virtual/a.mjs".');
});

test("Miniflare: respects rootPath for path-valued options", async ({
	expect,
}) => {
	const tmp = await useTmp();
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
	useDispose(mf);

	let res = await mf.dispatchFetch("http://localhost/a");
	expect(await res.json()).toEqual({
		text: "one text",
		data: "one data",
		result: 3,
	});
	res = await mf.dispatchFetch("http://localhost/b");
	expect(await res.json()).toEqual({
		text: "two text",
		manifest: ["2.txt"],
	});
	res = await mf.dispatchFetch("http://localhost/c");
	expect(await res.json()).toEqual({
		text: "three text",
	});
	expect(existsSync(path.join(tmp, "kv", "namespace"))).toBe(true);

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
	expect(await res.text()).toBe("value");

	// Check only resolves root path once for single worker options (with relative
	// root path)
	useCwd(tmp);
	await mf.setOptions({
		rootPath: "a",
		textBlobBindings: { TEXT: "1.txt" },
		script:
			'addEventListener("fetch", (event) => event.respondWith(new Response(TEXT)));',
	});
	res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("one text");
});

test("Miniflare: custom Node service binding", async ({ expect }) => {
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
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost");
	const text = await response.text();
	expect(text).toBe(
		`Response from custom Node service binding. The value of "custom-header" is "foo".`
	);
});

test("Miniflare: custom Node outbound service", async ({ expect }) => {
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
	useDispose(mf);

	const response = await mf.dispatchFetch("http://localhost");
	const text = await response.text();
	expect(text).toBe(
		`Response from custom Node outbound service. The value of "custom-header" is "foo".`
	);
});

test("Miniflare: setOptions: can restart workerd multiple times in succession", async ({
	expect,
}) => {
	// Regression test for https://github.com/cloudflare/workers-sdk/issues/11675
	// EBADF errors can occur when spawning a new workerd process if the stdio
	// pipes from the previous process are not properly cleaned up. This is
	// especially relevant when other parts of the system (like worker_threads
	// used by Miniflare or other Vite plugins) are also managing file descriptors.
	// While this test doesn't reliably reproduce the race condition, it validates
	// that the restart mechanism works correctly after the fix.
	const mf = new Miniflare({
		port: 0,
		modules: true,
		script: `export default {
			fetch() {
				return new Response("version 1");
			}
		}`,
	});
	useDispose(mf);

	// First request to ensure initial startup is complete
	let res = await mf.dispatchFetch("http://localhost");
	expect(await res.text()).toBe("version 1");

	// Perform multiple rapid setOptions calls to trigger workerd restarts.
	// This tests that the stdio pipe cleanup in dispose() works correctly.
	for (let i = 2; i <= 5; i++) {
		await mf.setOptions({
			port: 0,
			modules: true,
			script: `export default {
				fetch() {
					return new Response("version ${i}");
				}
			}`,
		});
		res = await mf.dispatchFetch("http://localhost");
		expect(await res.text()).toBe(`version ${i}`);
	}
});

test("Miniflare: MINIFLARE_WORKERD_CONFIG_DEBUG controls workerd config file creation", async ({
	expect,
}) => {
	const originalEnv = process.env.MINIFLARE_WORKERD_CONFIG_DEBUG;
	const configFilePath = "workerd-config.json";

	// Clean up any existing config file
	if (existsSync(configFilePath)) {
		await fs.unlink(configFilePath);
	}

	onTestFinished(async () => {
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
	// config file should not be created when MINIFLARE_WORKERD_CONFIG_DEBUG is not set
	expect(existsSync(configFilePath)).toBe(false);
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
	// workerd-config.json should be created when MINIFLARE_WORKERD_CONFIG_DEBUG=true
	expect(existsSync(configFilePath)).toBe(true);
	await mf.dispose();
});
