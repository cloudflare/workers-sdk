import { newWebSocketRpcSession } from "capnweb";

/**
 * Common environment type for remote binding workers.
 */
export type RemoteBindingEnv = {
	remoteProxyConnectionString?: string;
	binding: string;
};

/**
 * Throws a consistent error when a binding requires remote mode but isn't configured for it.
 */
export function throwRemoteRequired(bindingName: string): never {
	throw new Error(`Binding ${bindingName} needs to be run remotely`);
}

export function makeFetch(
	remoteProxyConnectionString: string | undefined,
	bindingName: string,
	extraHeaders?: Headers
) {
	return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		if (!remoteProxyConnectionString) {
			throwRemoteRequired(bindingName);
		}
		const request = new Request(input, init);

		const proxiedHeaders = new Headers(extraHeaders);
		for (const [name, value] of request.headers) {
			// The `Upgrade` header needs to be special-cased to prevent:
			//   TypeError: Worker tried to return a WebSocket in a response to a request which did not contain the header "Upgrade: websocket"
			if (name === "upgrade") {
				proxiedHeaders.set(name, value);
			} else {
				proxiedHeaders.set(`MF-Header-${name}`, value);
			}
		}
		proxiedHeaders.set("MF-URL", request.url);
		proxiedHeaders.set("MF-Binding", bindingName);
		const req = new Request(request, {
			headers: proxiedHeaders,
		});

		return fetch(remoteProxyConnectionString, req);
	};
}

/**
 * Create a remote proxy stub that proxies to a remote binding via capnweb.
 *
 * The stub intercepts `.fetch()` calls and sends them as plain HTTP
 * (via {@link makeFetch}) rather than through the capnweb RPC layer.
 * All other property accesses are forwarded to the capnweb RPC stub.
 *
 * @param remoteProxyConnectionString Base URL for the remote proxy
 * @param bindingName The binding name (sent as MF-Binding header)
 * @param extraContext Additional context to send with requests. Applied as URL
 *   search params for WebSocket RPC calls and as headers for HTTP fetch calls.
 *   This ensures context (like dispatch namespace options) reaches the server
 *   regardless of which path the request takes.
 */
export function makeRemoteProxyStub(
	remoteProxyConnectionString: string,
	bindingName: string,
	extraContext?: Record<string, string>
): Fetcher {
	const url = new URL(remoteProxyConnectionString);
	url.protocol = "ws:";
	url.searchParams.set("MF-Binding", bindingName);
	if (extraContext) {
		for (const [key, value] of Object.entries(extraContext)) {
			url.searchParams.set(key, value);
		}
	}

	// ProxiedService represents what we expose through the proxy. The capnweb
	// stub is duck-typed to this interface - it returns RPC stubs for property
	// accesses that forward calls to the remote server. The `as unknown as`
	// cast is safe because we wrap it in a Proxy that intercepts `.fetch()`
	// (which capnweb can't handle natively) and forwards everything else.
	type ProxiedService = Omit<Service, "connect" | "fetch"> & {
		fetch: typeof fetch;
		connect: never;
	};
	const stub = newWebSocketRpcSession(url.href) as unknown as ProxiedService;

	const extraHeaders = extraContext
		? new Headers(Object.entries(extraContext))
		: undefined;

	// Return a Proxy that intercepts `.fetch()` to use plain HTTP (better for
	// streaming responses) while forwarding all other property accesses to the
	// capnweb RPC stub. This is typed as Fetcher because that's how bindings
	// like DispatchNamespace.get() are typed, and the proxy is duck-type
	// compatible (it has .fetch() and forwards RPC methods).
	return new Proxy<ProxiedService>(stub, {
		get(_, p) {
			if (p === "fetch") {
				return makeFetch(
					remoteProxyConnectionString,
					bindingName,
					extraHeaders
				);
			}
			return Reflect.get(stub, p);
		},
	});
}
