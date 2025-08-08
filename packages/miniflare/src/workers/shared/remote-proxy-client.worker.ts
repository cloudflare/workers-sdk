import { rpcOverWebSocket } from "@cloudflare/jsrpc";
import { WorkerEntrypoint } from "cloudflare:workers";

type Env = {
	remoteProxyConnectionString: string;
	binding: string;
};
export default class Client extends WorkerEntrypoint<Env> {
	async fetch(request: Request) {
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
		proxiedHeaders.set("MF-Binding", this.env.binding);
		const req = new Request(request, {
			headers: proxiedHeaders,
		});

		return fetch(this.env.remoteProxyConnectionString, req);
	}

	constructor(ctx: ExecutionContext, env: Env) {
		const url = new URL(env.remoteProxyConnectionString);
		url.protocol = "ws:";
		url.searchParams.set("MF-Binding", env.binding);
		const session = rpcOverWebSocket(url.href);
		const stub = session.getStub();

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
