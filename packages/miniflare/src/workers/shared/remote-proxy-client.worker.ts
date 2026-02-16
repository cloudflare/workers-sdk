import { newWebSocketRpcSession } from "capnweb";
import { WorkerEntrypoint } from "cloudflare:workers";
import { makeFetch } from "./remote-bindings-utils";

type Env = {
	remoteProxyConnectionString?: string;
	binding: string;
	bindingType?: string;
};
export default class Client extends WorkerEntrypoint<Env> {
	async fetch(request: Request) {
		return makeFetch(
			this.env.remoteProxyConnectionString,
			this.env.binding
		)(request);
	}

	constructor(ctx: ExecutionContext, env: Env) {
		let stub: unknown;
		if (env.remoteProxyConnectionString) {
			const url = new URL(env.remoteProxyConnectionString);
			url.protocol = "ws:";
			url.searchParams.set("MF-Binding", env.binding);
			if (env.bindingType) {
				url.searchParams.set("MF-Binding-Type", env.bindingType);
			}
			stub = newWebSocketRpcSession(url.href);
		}

		super(ctx, env);

		return new Proxy(this, {
			get(target, prop) {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}
				if (!stub) {
					throw new Error(`Binding ${env.binding} needs to be run remotely`);
				}

				return Reflect.get(stub, prop);
			},
		});
	}
}
