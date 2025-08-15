import { newWebSocketRpcSession } from "@cloudflare/jsrpc";
import { WorkerEntrypoint } from "cloudflare:workers";
import { makeFetch } from "./remote-bindings-utils";

type Env = {
	remoteProxyConnectionString: string;
	binding: string;
};
export default class Client extends WorkerEntrypoint<Env> {
	async fetch(request: Request) {
		return makeFetch(
			this.env.remoteProxyConnectionString,
			this.env.binding
		)(request);
	}

	constructor(ctx: ExecutionContext, env: Env) {
		const url = new URL(env.remoteProxyConnectionString);
		url.protocol = "ws:";
		url.searchParams.set("MF-Binding", env.binding);
		const stub = newWebSocketRpcSession(url.href);

		super(ctx, env);

		return new Proxy(this, {
			get(target, prop) {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}

				return Reflect.get(stub, prop);
			},
		});
	}
}
