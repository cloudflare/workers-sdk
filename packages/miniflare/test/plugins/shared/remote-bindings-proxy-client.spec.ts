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

const RPC_PLAIN_OBJECT_SCRIPT = /* javascript */ `
	export default {
		async fetch(request, env) {
			const result = await env.SERVICE.listTokens();
			return Response.json({
				hasDisposer: Symbol.dispose in result,
				ownDisposerSymbols: Object.getOwnPropertySymbols(result)
					.map((symbol) => symbol.description)
					.filter((description) => description === "dispose"),
				total: result.total,
				tokenId: result.tokens[0].id,
			});
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

class PlainObjectRpcTarget extends RpcTarget {
	// A result that contains no RPC stubs: plain data, like a remote
	// Artifacts binding's listTokens() result.
	listTokens(): { tokens: { id: string }[]; total: number } {
		return { tokens: [{ id: "t1" }], total: 1 };
	}
}

function makeRemoteServiceMiniflare(script: string, proxyUrl: URL): Miniflare {
	return new Miniflare({
		workers: [
			{
				config: {
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

	// https://github.com/cloudflare/workers-sdk/issues/15830
	test("plain-data object results of remote binding RPC calls do not require dispose()", async ({
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
					new PlainObjectRpcTarget()
				);
			}
		);
		const mf = makeRemoteServiceMiniflare(RPC_PLAIN_OBJECT_SCRIPT, proxyUrl);
		useDispose(mf);

		const response = await mf.dispatchFetch("http://localhost/");
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			hasDisposer: boolean;
			ownDisposerSymbols: string[];
			total: number;
			tokenId: string;
		};
		// The caller's result is plain data: it must arrive without a disposer,
		// like the same data from a local entrypoint, so dropping it cannot log
		// "An RPC result was not disposed properly" at GC time.
		expect(body.hasDisposer).toBe(false);
		expect(body.ownDisposerSymbols).toEqual([]);
		expect(body.total).toBe(1);
		expect(body.tokenId).toBe("t1");
		expect(webSocketConnections).toBe(1);
	});
});
