import { newWorkersRpcResponse } from "capnweb";

// Shared server for the remote-bindings boundary. It terminates proxied fetch
// and capnweb JSRPC calls made by the remote-proxy client worker
// (`remote-proxy-client.worker.ts`) and dispatches them onto locally-bound
// services. Two consumers share this one implementation:
//   - Wrangler's remote-bindings proxy server
//     (`packages/wrangler/templates/remoteBindings/ProxyServerWorker.ts`), which
//     exposes a session's remote bindings to a local workerd instance.
//   - Miniflare's shared "storage owner"
//     (`core/storage-owner-server.worker.ts`), which exposes one process's local
//     storage to every other instance sharing a persist root.
// Each consumer supplies its own binding-resolution strategy; the wire protocol
// (MF-Binding / MF-URL / MF-Header-* / capnweb over WebSocket) is identical.

/** Thrown by a resolver when a requested binding is not served. Yields a 400. */
export class BindingError extends Error {}

type RpcTarget = Parameters<typeof newWorkersRpcResponse>[1];

export type RemoteBindingsProxyConfig<Env> = {
	/** Resolve the capnweb RPC target for a JSRPC (WebSocket) request. */
	resolveRpcBinding: (request: Request, env: Env) => RpcTarget;
	/**
	 * Resolve the fetcher for a plain fetch request, plus an optional hook to
	 * rewrite the reconstructed request headers before forwarding.
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

export function createRemoteBindingsProxyServer<Env>(
	config: RemoteBindingsProxyConfig<Env>
): ExportedHandler<Env> {
	const isJsRpc = config.isJsRpc ?? isJsRpcRequest;
	return {
		async fetch(request, env) {
			try {
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
