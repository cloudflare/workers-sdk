import { WorkerEntrypoint } from "cloudflare:workers";
import {
	makeFetch,
	makeRemoteProxyStub,
	RemoteBindingEnv,
	throwRemoteRequired,
} from "./remote-bindings-utils";

const HANDLER_RESERVED_KEYS = new Set([
	"alarm",
	"connect",
	"scheduled",
	"self",
	"tail",
	"tailStream",
	"test",
	"trace",
	"webSocketClose",
	"webSocketError",
	"webSocketMessage",
]);

/** Generic remote proxy client for bindings. */
export default class Client extends WorkerEntrypoint<RemoteBindingEnv> {
	fetch(request: Request): Promise<Response> {
		return makeFetch(
			this.env.remoteProxyConnectionString,
			this.env.binding
		)(request);
	}

	constructor(ctx: ExecutionContext, env: RemoteBindingEnv) {
		super(ctx, env);

		const stub = env.remoteProxyConnectionString
			? makeRemoteProxyStub(env.remoteProxyConnectionString, env.binding)
			: undefined;

		return new Proxy(this, {
			get: (target, prop) => {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}
				if (typeof prop === "string" && HANDLER_RESERVED_KEYS.has(prop)) {
					return;
				}
				if (!stub) {
					throwRemoteRequired(env.binding);
				}
				return Reflect.get(stub, prop);
			},
		});
	}
}
