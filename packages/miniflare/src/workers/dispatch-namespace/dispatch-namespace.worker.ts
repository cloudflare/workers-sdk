import { rpcOverWebSocket } from "@cloudflare/jsrpc";

interface Env {
	fetcher: Fetcher;
	remoteProxyConnectionString: string;
	binding: string;
}

export default function (env: Env) {
	return {
		get(
			name: string,
			args?: { [key: string]: any },
			options?: DynamicDispatchOptions
		): Fetcher {
			const url = new URL(env.remoteProxyConnectionString);
			url.protocol = "ws:";
			url.searchParams.set("MF-Binding", env.binding);
			url.searchParams.set(
				"MF-Dispatch-Namespace-Options",
				JSON.stringify({ name, args, options })
			);
			const session = rpcOverWebSocket(url.href);
			const stub = session.getStub();
			return new Proxy(stub, {
				get(_, p) {
					if (p === "fetch") {
						return (
							input: RequestInfo | URL,
							init?: RequestInit
						): Promise<Response> => {
							const request = new Request(input, init);
							request.headers.set(
								"MF-Dispatch-Namespace-Options",
								JSON.stringify({ name, args, options })
							);
							const proxiedHeaders = new Headers();
							for (const [name, value] of request.headers) {
								// The `Upgrade` header needs to be special-cased to prevent:
								//   TypeError: Worker tried to return a WebSocket in a response to a request which did not contain the header "Upgrade: websocket"
								if (name === "upgrade" || name.startsWith("MF-")) {
									proxiedHeaders.set(name, value);
								} else {
									proxiedHeaders.set(`MF-Header-${name}`, value);
								}
							}
							proxiedHeaders.set("MF-URL", request.url);
							proxiedHeaders.set("MF-Binding", env.binding);
							const req = new Request(request, {
								headers: proxiedHeaders,
							});

							return fetch(env.remoteProxyConnectionString, req);
						};
					} else {
						return Reflect.get(stub, p);
					}
				},
			}) as Fetcher;
		},
	} satisfies DispatchNamespace;
}
