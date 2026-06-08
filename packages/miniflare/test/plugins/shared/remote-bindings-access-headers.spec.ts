import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { TestLog, useDispose, useServer } from "../../test-shared";
import type { RemoteProxyConnectionString } from "miniflare";

// Build a `remoteProxyConnectionString` (a branded URL) that carries an opaque
// auth header bag, mirroring what wrangler's `startRemoteProxySession()` does
// after resolving `getAccessHeaders()`. Miniflare forwards the bag to the proxy
// client worker, which spreads it onto outgoing requests to the proxy server.
function connStrWithHeaders(
	url: URL,
	headers?: Record<string, string>
): RemoteProxyConnectionString {
	const connStr = new URL(url.href) as RemoteProxyConnectionString;
	if (headers) {
		connStr.remoteProxyHeaders = headers;
	}
	return connStr;
}

// User worker that drives the HTTP (`makeFetch`) path of a remote binding.
const HTTP_SCRIPT = /* javascript */ `
	export default {
		async fetch(request, env) {
			const res = await env.SERVICE.fetch("http://example.com/");
			return new Response(await res.text(), { status: res.status });
		},
	};
`;

// User worker that drives the WebSocket/capnweb (RPC) path of a remote binding.
// The fake proxy server doesn't speak capnweb, so the RPC never resolves — we
// only care that the authenticated handshake reached the server. Swallow the
// resulting error so the request completes.
const RPC_SCRIPT = /* javascript */ `
	export default {
		async fetch(request, env) {
			try {
				await env.SERVICE.ping();
			} catch {}
			return new Response("done");
		},
	};
`;

describe("remote-bindings proxy client: auth header forwarding", () => {
	describe("HTTP (makeFetch) path", () => {
		test("forwards Access service-token headers to the proxy server", async ({
			expect,
		}) => {
			let received: Record<string, string | string[] | undefined> = {};
			const { http: proxyUrl } = await useServer((req, res) => {
				received = req.headers;
				res.statusCode = 200;
				res.end("ok");
			});

			const mf = new Miniflare({
				modules: true,
				compatibilityDate: "2025-01-01",
				log: new TestLog(),
				script: HTTP_SCRIPT,
				serviceBindings: {
					SERVICE: {
						name: "some-remote-service",
						remoteProxyConnectionString: connStrWithHeaders(proxyUrl, {
							"CF-Access-Client-Id": "test-client-id.access",
							"CF-Access-Client-Secret": "test-client-secret",
						}),
					},
				},
			});
			useDispose(mf);

			const response = await mf.dispatchFetch("http://localhost/");
			await response.text();

			expect(received["cf-access-client-id"]).toBe("test-client-id.access");
			expect(received["cf-access-client-secret"]).toBe("test-client-secret");
		});

		test("forwards a cloudflared cookie to the proxy server", async ({
			expect,
		}) => {
			let received: Record<string, string | string[] | undefined> = {};
			const { http: proxyUrl } = await useServer((req, res) => {
				received = req.headers;
				res.statusCode = 200;
				res.end("ok");
			});

			const mf = new Miniflare({
				modules: true,
				compatibilityDate: "2025-01-01",
				log: new TestLog(),
				script: HTTP_SCRIPT,
				serviceBindings: {
					SERVICE: {
						name: "some-remote-service",
						remoteProxyConnectionString: connStrWithHeaders(proxyUrl, {
							Cookie: "CF_Authorization=test-cookie-token",
						}),
					},
				},
			});
			useDispose(mf);

			const response = await mf.dispatchFetch("http://localhost/");
			await response.text();

			expect(received["cookie"]).toBe("CF_Authorization=test-cookie-token");
		});

		test("sends no Access headers when none are configured", async ({
			expect,
		}) => {
			let received: Record<string, string | string[] | undefined> = {};
			const { http: proxyUrl } = await useServer((req, res) => {
				received = req.headers;
				res.statusCode = 200;
				res.end("ok");
			});

			const mf = new Miniflare({
				modules: true,
				compatibilityDate: "2025-01-01",
				log: new TestLog(),
				script: HTTP_SCRIPT,
				serviceBindings: {
					SERVICE: {
						name: "some-remote-service",
						remoteProxyConnectionString: connStrWithHeaders(proxyUrl),
					},
				},
			});
			useDispose(mf);

			const response = await mf.dispatchFetch("http://localhost/");
			await response.text();

			expect(received["cf-access-client-id"]).toBeUndefined();
			expect(received["cf-access-client-secret"]).toBeUndefined();
			expect(received["cookie"]).toBeUndefined();
		});
	});

	describe("WebSocket (capnweb) path", () => {
		test("includes Access headers in the capnweb upgrade handshake", async ({
			expect,
		}) => {
			let upgradeHeaders:
				| Record<string, string | string[] | undefined>
				| undefined;
			const { http: proxyUrl } = await useServer(
				(_req, res) => {
					// Non-WebSocket requests (e.g. an HTTP probe) just succeed.
					res.statusCode = 200;
					res.end("ok");
				},
				(socket, req) => {
					// Capture the handshake headers, then close so the (non-capnweb)
					// RPC attempt fails fast instead of hanging the test.
					upgradeHeaders = req.headers;
					socket.close();
				}
			);

			const mf = new Miniflare({
				modules: true,
				compatibilityDate: "2025-01-01",
				log: new TestLog(),
				script: RPC_SCRIPT,
				serviceBindings: {
					SERVICE: {
						name: "some-remote-service",
						remoteProxyConnectionString: connStrWithHeaders(proxyUrl, {
							"CF-Access-Client-Id": "ws-client-id.access",
							"CF-Access-Client-Secret": "ws-client-secret",
						}),
					},
				},
			});
			useDispose(mf);

			const response = await mf.dispatchFetch("http://localhost/");
			await response.text();

			// Give the background upgrade a moment to land if it hasn't already.
			for (let i = 0; i < 20 && upgradeHeaders === undefined; i++) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}

			expect(upgradeHeaders).toBeDefined();
			expect(upgradeHeaders?.["cf-access-client-id"]).toBe(
				"ws-client-id.access"
			);
			expect(upgradeHeaders?.["cf-access-client-secret"]).toBe(
				"ws-client-secret"
			);
		});
	});
});
