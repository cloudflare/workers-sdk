import assert from "assert";
import http from "http";
import { AddressInfo } from "net";
import test from "ava";
import {
	DeferredPromise,
	MessageEvent,
	Miniflare,
	MiniflareCoreError,
	MiniflareOptions,
	fetch,
} from "miniflare";
import {
	CloseEvent as StandardCloseEvent,
	MessageEvent as StandardMessageEvent,
	WebSocketServer,
} from "ws";
import { TestLog, useServer } from "./test-shared";

test("Miniflare: validates options", async (t) => {
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
});

test("Miniflare: keeps port between updates", async (t) => {
	const opts: MiniflareOptions = {
		port: 0,
		script: `addEventListener("fetch", (event) => {
      event.respondWith(new Response("a"));
    })`,
	};
	const mf = new Miniflare(opts);
	const initialURL = await mf.ready;

	await mf.setOptions(opts);
	const updatedURL = await mf.ready;

	t.not(initialURL.port, "0");
	t.is(initialURL.port, updatedURL.port);
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
	let res = await mf.dispatchFetch("https://custom1.mf/a");
	t.deepEqual(await res.json(), {
		method: "GET",
		url: "https://custom1.mf/a",
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

test("Miniflare: custom upstream as origin", async (t) => {
	const upstream = await useServer(t, (req, res) => {
		res.end(`upstream: ${new URL(req.url ?? "", "http://upstream")}`);
	});
	const mf = new Miniflare({
		upstream: new URL("/extra/", upstream.http.toString()).toString(),
		modules: true,
		script: `export default {
      fetch(request) {
        return fetch(request);
      }
    }`,
	});
	// Check rewrites protocol, hostname, and port, but keeps pathname and query
	const res = await mf.dispatchFetch("https://random:0/path?a=1");
	t.is(await res.text(), "upstream: http://upstream/extra/path?a=1");
});

test("Miniflare: `node:` and `cloudflare:` modules", async (t) => {
	const mf = new Miniflare({
		modules: true,
		compatibilityFlags: ["nodejs_compat"],
		script: `
    import assert from "node:assert";
    import { Buffer } from "node:buffer";
    import { connect } from "cloudflare:sockets"; 
    export default {
      fetch() {
        assert.strictEqual(typeof connect, "function");
        return new Response(Buffer.from("test").toString("base64"))
      }
    }
    `,
	});
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
	const res = await mf.dispatchFetch("http://localhost");
	t.is(await res.text(), "123");
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
	const res = await mf.dispatchFetch("http://localhost");
	t.true(res.ok);
});

test("Miniflare: Accepts https requests", async (t) => {
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

	const res = await mf.dispatchFetch("https://localhost");
	t.true(res.ok);

	t.assert(log.logs[0][1].startsWith("Ready on https://"));
});
