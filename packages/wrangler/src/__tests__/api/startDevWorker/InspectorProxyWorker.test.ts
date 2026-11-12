import events from "node:events";
import net from "node:net";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { describe, it } from "vitest";
import inspectorProxyWorkerPath from "worker:startDevWorker/InspectorProxyWorker";
import WebSocket from "ws";
import { useTeardown } from "../../helpers/teardown";

describe("InspectorProxyWorker", () => {
	const teardown = useTeardown();

	// https://github.com/cloudflare/workers-sdk/issues/9789
	// With `wrangler dev --ip <LAN IP>` on macOS with the firewall on, every
	// connection from workerd to the ProxyController (Node.js) is reset. The
	// InspectorProxyWorker then reports each failed request to the
	// ProxyController over the same failing channel, which fails again, and so
	// on: thousands of requests a second that never stop.
	it("doesn't flood the ProxyController with requests when it can't reach it", async ({
		expect,
	}) => {
		// Stands in for the ProxyController behind a firewall: every connection
		// is accepted and then reset, as the reporter's logs show
		// (`Connection reset by peer`, `stream disconnected prematurely`)
		let connections = 0;
		const server = net.createServer((socket) => {
			connections++;
			socket.resetAndDestroy();
		});
		server.listen(0, "127.0.0.1");
		await events.once(server, "listening");
		teardown(
			() => new Promise<void>((resolve) => server.close(() => resolve()))
		);
		const { port } = server.address() as net.AddressInfo;

		// The InspectorProxyWorker as the ProxyController configures it, but with
		// PROXY_CONTROLLER pointing at the unreachable endpoint above
		const secret = "proxy-controller-secret";
		const mf = new Miniflare(
			convertV4MiniflareOptions({
				workers: [
					{
						name: "InspectorProxyWorker",
						compatibilityDate: "2023-12-18",
						compatibilityFlags: [
							"nodejs_compat",
							"increase_websocket_message_size",
						],
						modulesRoot: path.dirname(inspectorProxyWorkerPath),
						modules: [{ type: "ESModule", path: inspectorProxyWorkerPath }],
						durableObjects: {
							DURABLE_OBJECT: {
								className: "InspectorProxyWorker",
								unsafePreventEviction: true,
							},
						},
						serviceBindings: {
							PROXY_CONTROLLER: {
								external: { address: `127.0.0.1:${port}`, http: {} },
							},
						},
						bindings: {
							PROXY_CONTROLLER_AUTH_SECRET: secret,
							WRANGLER_VERSION: "0.0.0",
						},
						unsafeDirectSockets: [{ host: "127.0.0.1", port: 0 }],
						cacheAPI: false,
						unsafeEphemeralDurableObjects: true,
					},
				],
			})
		);
		teardown(() => mf.dispose());

		// Connect as the ProxyController does, and send the first message it
		// sends on startup. The InspectorProxyWorker logs it back to the
		// ProxyController as one debug-log request.
		const url = await mf.unsafeGetDirectURL("InspectorProxyWorker");
		url.pathname = "/cdn-cgi/InspectorProxyWorker/websocket";
		const webSocket = new WebSocket(url, {
			headers: { Authorization: secret },
			perMessageDeflate: false,
		});
		await events.once(webSocket, "open");
		teardown(() => webSocket.close());
		webSocket.send(JSON.stringify({ type: "reloadStart" }));

		await setTimeout(1000);
		const afterOneSecond = connections;
		await setTimeout(1000);
		const afterTwoSeconds = connections;

		// The one message may fail to arrive, but its failure shouldn't set off
		// an unbounded stream of further requests
		expect(afterOneSecond).toBeGreaterThan(0);
		expect(afterOneSecond).toBeLessThan(10);
		expect(afterTwoSeconds).toBe(afterOneSecond);
	});
});
