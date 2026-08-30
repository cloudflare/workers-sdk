import { newWebSocketRpcSession, RpcTarget } from "capnweb";
import { Miniflare } from "miniflare";
import { describe, test } from "vitest";
import { singleModuleManifest, useDispose, useServer } from "../../test-shared";
import type { RemoteProxyConnectionString } from "miniflare";

const FETCH_SCRIPT = /* javascript */ `
	export default {
		async fetch(request, env) {
			const response = await env.SERVICE.fetch("http://example.com/");
			return new Response(await response.text());
		},
	};
`;

const RPC_SCRIPT = /* javascript */ `
	export default {
		async fetch(request, env) {
			return new Response(await env.SERVICE.echo("hello"));
		},
	};
`;

const RPC_GETTER_SCRIPT = /* javascript */ `
	export default {
		async fetch(request, env) {
			return new Response(await env.SERVICE.greeting);
		},
	};
`;

class EchoRpcTarget extends RpcTarget {
	echo(value: string): string {
		return value;
	}

	get greeting(): string {
		return "hello";
	}
}

function makeRemoteServiceMiniflare(script: string, proxyUrl: URL): Miniflare {
	return new Miniflare({
		workers: [
			{
				config: {
					type: "worker",
					name: "",
					compatibilityDate: "2025-01-01",
					manifest: singleModuleManifest(script),
					env: {
						SERVICE: {
							type: "worker",
							worker: "some-remote-service",
							dev: { remote: true },
						},
					},
				},
				dev: {
					remoteProxyConnectionString: proxyUrl as RemoteProxyConnectionString,
				},
			},
		],
	});
}

describe("remote-bindings proxy client", () => {
	test("does not open an RPC WebSocket for a fetch-only binding", async ({
		expect,
	}) => {
		let fetchRequests = 0;
		let webSocketConnections = 0;
		const { http: proxyUrl } = await useServer(
			(req, res) => {
				fetchRequests++;
				res.statusCode = 200;
				res.end("ok");
			},
			(socket) => {
				webSocketConnections++;
				socket.close();
			}
		);
		const mf = makeRemoteServiceMiniflare(FETCH_SCRIPT, proxyUrl);
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/");
		expect(await response.text()).toBe("ok");
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(fetchRequests).toBe(1);
		expect(webSocketConnections).toBe(0);
	});

	test("opens an RPC WebSocket when an RPC method is called", async ({
		expect,
	}) => {
		let webSocketConnections = 0;
		const { http: proxyUrl } = await useServer(
			(req, res) => {
				res.statusCode = 500;
				res.end("expected a WebSocket request");
			},
			(socket) => {
				webSocketConnections++;
				newWebSocketRpcSession(
					socket as unknown as WebSocket,
					new EchoRpcTarget()
				);
			}
		);
		const mf = makeRemoteServiceMiniflare(RPC_SCRIPT, proxyUrl);
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/");
		expect(await response.text()).toBe("hello");
		expect(webSocketConnections).toBe(1);
	});

	test("opens an RPC WebSocket when an RPC property is awaited", async ({
		expect,
	}) => {
		let webSocketConnections = 0;
		const { http: proxyUrl } = await useServer(
			(req, res) => {
				res.statusCode = 500;
				res.end("expected a WebSocket request");
			},
			(socket) => {
				webSocketConnections++;
				newWebSocketRpcSession(
					socket as unknown as WebSocket,
					new EchoRpcTarget()
				);
			}
		);
		const mf = makeRemoteServiceMiniflare(RPC_GETTER_SCRIPT, proxyUrl);
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/");
		expect(await response.text()).toBe("hello");
		expect(webSocketConnections).toBe(1);
	});
});
