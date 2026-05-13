import { newWebSocketRpcSession } from "capnweb";

/**
 * Common environment type for remote binding workers.
 */
export type RemoteBindingEnv = {
	remoteProxyConnectionString?: string;
	binding: string;
	cfTraceId?: string;
};

/** Headers sent alongside proxy requests to provide additional context. */
export type ProxyMetadata = {
	"MF-Dispatch-Namespace-Options"?: string;
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
	extraHeaders?: Headers,
	cfTraceId?: string
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
		if (cfTraceId) {
			// Set directly on the outgoing request so Cloudflare's edge tracing picks it up
			proxiedHeaders.set("cf-trace-id", cfTraceId);
			// Also forward through to the binding call via the MF-Header proxy mechanism
			proxiedHeaders.set("MF-Header-cf-trace-id", cfTraceId);
		}
		const req = new Request(request, {
			headers: proxiedHeaders,
		});

		return fetch(remoteProxyConnectionString, req);
	};
}

/**
 * Create a remote proxy stub that proxies to a remote binding via capnweb.
 *
 * Intercepts `.fetch()` to use plain HTTP; forwards other accesses to capnweb.
 */
export function makeRemoteProxyStub(
	remoteProxyConnectionString: string,
	bindingName: string,
	metadata?: ProxyMetadata,
	cfTraceId?: string
): Fetcher {
	const url = new URL(remoteProxyConnectionString);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("MF-Binding", bindingName);
	if (metadata) {
		for (const [key, value] of Object.entries(metadata)) {
			if (value !== undefined) {
				url.searchParams.set(key, value);
			}
		}
	}

	type ProxiedService = Omit<Service, "connect" | "fetch"> & {
		fetch: typeof fetch;
		connect: never;
	};
	const stub = newWebSocketRpcSession(url.href) as unknown as ProxiedService;

	const headers = metadata
		? new Headers(
				Object.entries(metadata).filter(
					(entry): entry is [string, string] => entry[1] !== undefined
				)
			)
		: undefined;

	return new Proxy<ProxiedService>(stub, {
		get(_, p) {
			if (p === "fetch") {
				return makeFetch(
					remoteProxyConnectionString,
					bindingName,
					headers,
					cfTraceId
				);
			}
			return Reflect.get(stub, p);
		},
	});
}
