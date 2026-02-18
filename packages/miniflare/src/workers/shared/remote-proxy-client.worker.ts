import { WorkerEntrypoint } from "cloudflare:workers";
import {
	makeFetch,
	makeRemoteProxyStub,
	RemoteBindingEnv,
	throwRemoteRequired,
} from "./remote-bindings-utils";

/**
 * Generic remote proxy client for bindings like Media.
 *
 * - `.fetch()` is a native method that sends requests as plain HTTP (for streaming)
 * - All other methods are proxied via capnweb RPC to the remote server
 *
 * Note: Dispatch namespaces use a dedicated worker because they need a custom
 * `.get()` method, and adding it here would shadow user RPC methods named "get".
 */
export default class Client extends WorkerEntrypoint<RemoteBindingEnv> {
	#stub: Fetcher | undefined;

	fetch(request: Request): Promise<Response> {
		return makeFetch(
			this.env.remoteProxyConnectionString,
			this.env.binding
		)(request);
	}

	constructor(ctx: ExecutionContext, env: RemoteBindingEnv) {
		super(ctx, env);

		if (env.remoteProxyConnectionString) {
			this.#stub = makeRemoteProxyStub(
				env.remoteProxyConnectionString,
				env.binding
			);
		}

		// Proxy unknown property accesses to the RPC stub
		return new Proxy(this, {
			get: (target, prop) => {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}
				if (!this.#stub) {
					throwRemoteRequired(env.binding);
				}
				return Reflect.get(this.#stub, prop);
			},
		});
	}
}
