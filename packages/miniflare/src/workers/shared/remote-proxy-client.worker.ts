import { WorkerEntrypoint } from "cloudflare:workers";
import {
	makeFetch,
	makeRemoteProxyStub,
	RemoteBindingEnv,
	throwRemoteRequired,
} from "./remote-bindings-utils";

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
			? makeRemoteProxyStub(
					env.remoteProxyConnectionString,
					env.binding,
					env.bindingType ? { "MF-Binding-Type": env.bindingType } : undefined
				)
			: undefined;

		return new Proxy(this, {
			get: (target, prop) => {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}
				if (!stub) {
					throwRemoteRequired(env.binding);
				}
				return Reflect.get(stub, prop);
			},
		});
	}
}
