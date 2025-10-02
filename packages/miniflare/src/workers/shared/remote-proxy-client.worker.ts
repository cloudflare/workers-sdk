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

	tail(events: TraceItem[]) {
		// Temporary workaround: the tail events is not serializable over capnproto yet
		// But they are effectively JSON, so we are serializing them to JSON and parsing it back to make it transferable.
		// FIXME when https://github.com/cloudflare/workerd/pull/4595 lands
		const serialized = JSON.stringify(events, tailEventsReplacer);

		const fetcher = makeFetch(
			this.env.remoteProxyConnectionString,
			this.env.binding,
			new Headers({ "MF-Tail": "true" })
		);

		this.ctx.waitUntil(
			fetcher(
				new Request("http://example.com", { method: "POST", body: serialized })
			)
		);
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

const serializedDate = "___serialized_date___";

function tailEventsReplacer(_: string, value: any) {
	// The tail events might contain Date objects which will not be restored directly
	if (value instanceof Date) {
		return { [serializedDate]: value.toISOString() };
	}
	return value;
}
