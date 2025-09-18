import { newWebSocketRpcSession } from "capnweb";
import { DurableObject, WorkerEntrypoint } from "cloudflare:workers";
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

				if (prop === "tail") {
					return (events: unknown) => {
						// @ts-expect-error TODO: Remove this whole hack and make TraceItem serializable in JSRPC
						return stub.tail(JSON.parse(JSON.stringify(events)));
					};
				}

				return Reflect.get(stub, prop);
			},
		});
	}
}

export class DurableObjectProxy extends DurableObject<Env> {
	async fetch(request: Request) {
		return makeFetch(
			this.env.remoteProxyConnectionString,
			this.env.binding,
			new Headers({
				"MF-DO-ID": this.ctx.id.toString(),
			})
		)(request);
	}

	constructor(state: DurableObjectState, env: Env) {
		const url = new URL(env.remoteProxyConnectionString);
		url.protocol = "ws:";
		url.searchParams.set("MF-Binding", env.binding);
		url.searchParams.set("MF-DO-ID", state.id.toString());
		const stub = newWebSocketRpcSession(url.href);

		super(state, env);

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
