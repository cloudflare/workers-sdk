import { newWebSocketRpcSession } from "@cloudflare/jsrpc";
import { makeFetch } from "../shared/remote-bindings-utils";

interface Env {
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
			const stub = newWebSocketRpcSession(url.href);

			return new Proxy(stub, {
				get(_, p) {
					// We don't want to wrap direct .fetch() calls on a customer worker in a JSRPC layer
					// Instead, intercept accesses to the specific `fetch` key, and send them directly
					if (p === "fetch") {
						return makeFetch(
							env.remoteProxyConnectionString,
							env.binding,
							new Headers({
								"MF-Dispatch-Namespace-Options": JSON.stringify({
									name,
									args,
									options,
								}),
							})
						);
					}

					return Reflect.get(stub, p);
				},
			}) as Service;
		},
	} satisfies DispatchNamespace;
}
