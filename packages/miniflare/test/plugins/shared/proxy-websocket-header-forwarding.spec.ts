import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { useDispose, useServer } from "../../test-shared";
import type { IncomingHttpHeaders } from "node:http";

// Baseline-characterisation test for PR #14198
// (krys-cf:fix/remote-bindings-access-service-token).
//
// This test isolates the one workerd capability that BOTH the existing code path
// and PR #14198 implicitly rely on: that a fetch with `Upgrade: websocket` carries
// arbitrary request headers all the way to the upstream WebSocket server during
// the upgrade handshake.
//
// In remote-bindings dev today the request flow is:
//
//   User worker (Miniflare A)
//     └─ remote-proxy-client.worker  ─ws/http─▶  http://127.0.0.1:<port>  (ProxyWorker B, LOCAL)
//          ProxyWorker.processQueue   [packages/wrangler/templates/startDevWorker/ProxyWorker.ts]
//            headers = new Headers(request.headers);              // line ~121
//            for (...) headers.set(key, value);                   // line ~146-155 (proxyData merge)
//            fetch(userWorkerUrl, new Request(request, { headers })); // line ~158
//                                          ─▶  https://<token.host>.workers.dev   (edge, MAYBE Access-protected)
//
// `proxyData.headers` is computed by RemoteRuntimeController and contains the
// result of `getAccessHeaders(token.host)`. So *if* workerd preserves both
// (a) the proxyData-merged headers AND (b) the incoming-request headers on the
// outbound WS upgrade, the ProxyWorker→edge hop already authenticates with
// Access service-token headers — without any miniflare-side credential plumbing.
//
// This test reproduces ProxyWorker.processQueue's forward line in isolation
// against a fake edge that records the upgrade handshake headers. Two distinct
// sentinel headers — one set by the worker (simulating proxyData.headers) and
// one passed in on the incoming request (simulating client-originated headers)
// — let us distinguish:
//
//   ┌───────────────────────────────────────┬─────────────────────────────────┐
//   │ Edge receives                         │ Verdict                         │
//   ├───────────────────────────────────────┼─────────────────────────────────┤
//   │ both sentinels                        │ Existing path already auths WS  │
//   │                                       │ → PR's WS fetch-upgrade auth is │
//   │                                       │   REDUNDANT for reaching the    │
//   │                                       │   edge.                         │
//   ├───────────────────────────────────────┼─────────────────────────────────┤
//   │ only incoming sentinel                │ proxyData headers dropped on WS │
//   │                                       │ → PR's mechanism is JUSTIFIED.  │
//   ├───────────────────────────────────────┼─────────────────────────────────┤
//   │ only proxyData sentinel               │ Existing path works; PR's       │
//   │                                       │ client-side header wouldn't     │
//   │                                       │ propagate.                      │
//   ├───────────────────────────────────────┼─────────────────────────────────┤
//   │ neither                               │ WS header forwarding broken →   │
//   │                                       │ PR couldn't work either; the AI │
//   │                                       │ `invalid_token` is a separate   │
//   │                                       │ failure (look elsewhere).       │
//   └───────────────────────────────────────┴─────────────────────────────────┘

// Mirrors the exact forward line in ProxyWorker.processQueue
// (packages/wrangler/templates/startDevWorker/ProxyWorker.ts:121, 146-155, 158).
// `new Headers(request.headers)` preserves the incoming request's headers;
// `headers.set(...)` adds the proxyData-merged sentinel; `fetch(EDGE_URL, new
// Request(request, { headers }))` forwards the (now header-merged) request,
// including any `Upgrade: websocket`.
const FORWARDING_WORKER = /* javascript */ `
	export default {
		async fetch(request, env) {
			const headers = new Headers(request.headers);
			headers.set("x-proxydata-sentinel", "from-proxydata");
			return fetch(env.EDGE_URL, new Request(request, { headers }));
		}
	};
`;

describe("ProxyWorker WS-upgrade header forwarding (baseline)", () => {
	test("workerd forwards both proxyData-merged and incoming-request headers on a WS upgrade", async ({
		expect,
	}) => {
		let upgradeHeaders: IncomingHttpHeaders | undefined;

		// Fake "edge" server. The HTTP listener serves any non-WS request with a
		// 426 so the test doesn't accidentally pass on a non-upgrade request.
		// The WS listener captures the upgrade headers (which is all we need)
		// then immediately closes the socket.
		const { http: edge } = await useServer(
			(_req, res) => {
				res.statusCode = 426;
				res.end();
			},
			(socket, req) => {
				upgradeHeaders = { ...req.headers };
				socket.close();
			}
		);

		const mf = new Miniflare({
			modules: true,
			compatibilityDate: "2025-01-01",
			script: FORWARDING_WORKER,
			bindings: { EDGE_URL: edge.toString() },
		});
		useDispose(mf);

		// Send a WS-upgrade request *into* the forwarding worker, with our
		// "incoming-request" sentinel. The worker will set the
		// "proxydata-merged" sentinel and re-issue the request against the
		// fake edge URL it has via `env.EDGE_URL`. workerd's outbound fetch
		// handles the WS upgrade.
		const res = await mf.dispatchFetch("http://localhost/", {
			headers: {
				Upgrade: "websocket",
				"x-incoming-sentinel": "from-client",
			},
		});
		// Release whatever the worker handed back so the response stream
		// (and any associated WebSocket) is cleaned up promptly.
		if (res.webSocket) {
			res.webSocket.accept();
			res.webSocket.close();
		} else {
			await res.body?.cancel();
		}

		// Give the fake WS server a tick to record the upgrade headers in case
		// the close races the connection event (the existing access-warning
		// spec uses the same pattern at remote-bindings-access-warning.spec.ts).
		for (let i = 0; i < 50 && upgradeHeaders === undefined; i++) {
			await new Promise((resolve) => setTimeout(resolve, 20));
		}

		expect(upgradeHeaders).toBeDefined();
		// (a) Does the proxyData-merged header reach the edge on a WS upgrade?
		expect(upgradeHeaders?.["x-proxydata-sentinel"]).toBe("from-proxydata");
		// (b) Does the incoming-request header reach the edge on a WS upgrade?
		expect(upgradeHeaders?.["x-incoming-sentinel"]).toBe("from-client");
	});
});
