import { newWorkersRpcResponse } from "capnweb";
import { pipeSocketOverWebSocket } from "./remote-bindings-utils";

// Shared server for the remote-bindings boundary. It terminates proxied fetch,
// capnweb JSRPC, and raw TCP connect calls made by the remote-proxy client worker
// (`remote-proxy-client.worker.ts`) and dispatches them onto locally-bound
// services. Used by the @cloudflare/remote-bindings proxy server
// (`packages/remote-bindings/templates/remoteBindings/ProxyServerWorker.ts`),
// which exposes a session's remote bindings to a local workerd instance. The
// consumer supplies its own binding-resolution strategy; the wire protocol is
// shared by both servers.

/** Thrown by a resolver when a requested binding is not served. Yields a 400. */
export class BindingError extends Error {}

type RpcTarget = Parameters<typeof newWorkersRpcResponse>[1];

export type RemoteBindingsProxyConfig<Env> = {
	/** Resolve the capnweb RPC target for a JSRPC (WebSocket) request. */
	resolveRpcBinding: (request: Request, env: Env) => RpcTarget;
	/**
	 * Resolve the fetcher for a plain fetch or raw TCP connect request, plus an
	 * optional hook to rewrite reconstructed fetch headers before forwarding.
	 */
	resolveFetchBinding: (
		request: Request,
		env: Env
	) => { fetcher: Fetcher; rewriteHeaders?: (headers: Headers) => void };
	/** Override JSRPC detection (defaults to `isJsRpcRequest`). */
	isJsRpc?: (request: Request) => boolean;
};

/** capnweb sessions arrive as a WebSocket upgrade carrying an MF-Binding query. */
export function isJsRpcRequest(request: Request): boolean {
	return (
		request.headers.has("Upgrade") &&
		new URL(request.url).searchParams.has("MF-Binding")
	);
}

/**
 * Raw TCP tunnels arrive as WebSocket upgrades carrying the destination in
 * `MF-Connect-Address`.
 */
export function isConnectRequest(request: Request): boolean {
	return (
		request.headers.get("Upgrade") === "websocket" &&
		request.headers.has("MF-Connect-Address")
	);
}

function handleConnectRequest<Env>(
	request: Request,
	env: Env,
	config: RemoteBindingsProxyConfig<Env>
): Response {
	const address = request.headers.get("MF-Connect-Address");
	if (address === null) {
		return new Response("Missing MF-Connect-Address header", { status: 400 });
	}

	const { fetcher } = config.resolveFetchBinding(request, env);

	const { 0: client, 1: server } = new WebSocketPair();
	server.accept();

	const socket = fetcher.connect(address);
	pipeSocketOverWebSocket(socket, server).catch(() => {});

	return new Response(null, { status: 101, webSocket: client });
}

export function createRemoteBindingsProxyServer<Env>(
	config: RemoteBindingsProxyConfig<Env>
): ExportedHandler<Env> {
	const isJsRpc = config.isJsRpc ?? isJsRpcRequest;
	return {
		async fetch(request, env) {
			try {
				if (isConnectRequest(request)) {
					return handleConnectRequest(request, env, config);
				}

				if (isJsRpc(request)) {
					return await newWorkersRpcResponse(
						request,
						config.resolveRpcBinding(request, env)
					);
				}

				const { fetcher, rewriteHeaders } = config.resolveFetchBinding(
					request,
					env
				);

				const originalHeaders = new Headers();
				for (const [name, value] of request.headers) {
					if (name.startsWith("mf-header-")) {
						originalHeaders.set(name.slice("mf-header-".length), value);
					} else if (name === "upgrade") {
						// The `Upgrade` header needs to be special-cased to prevent:
						//   TypeError: Worker tried to return a WebSocket in a response to
						//   a request which did not contain the header "Upgrade: websocket"
						originalHeaders.set(name, value);
					}
				}
				rewriteHeaders?.(originalHeaders);

				return await fetcher.fetch(
					request.headers.get("MF-URL") ?? "http://example.com",
					new Request(request, {
						redirect: "manual",
						headers: originalHeaders,
					})
				);
			} catch (e) {
				if (e instanceof BindingError) {
					return new Response(e.message, { status: 400 });
				}
				return new Response((e as Error).message, { status: 500 });
			}
		},
	};
}
