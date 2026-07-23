import { WorkerEntrypoint } from "cloudflare:workers";
import { SharedBindings } from "./constants";
import {
	makeFetch,
	makeRemoteProxyStub,
	throwRemoteRequired,
} from "./remote-bindings-utils";
import type {
	RemoteBindingEnv,
	RemoteBindingProps,
} from "./remote-bindings-utils";

/** Generic remote proxy client for bindings. */
export default class Client extends WorkerEntrypoint<
	RemoteBindingEnv,
	RemoteBindingProps
> {
	fetch(request: Request): Promise<Response> {
		return makeFetch(
			this.ctx.props.remoteProxyConnectionString,
			this.ctx.props.binding,
			undefined,
			this.ctx.props.cfTraceId,
			this.env[SharedBindings.MAYBE_SERVICE_LOOPBACK]
		)(request);
	}

	constructor(
		ctx: ExecutionContext<RemoteBindingProps>,
		env: RemoteBindingEnv
	) {
		super(ctx, env);

		const stub = ctx.props.remoteProxyConnectionString
			? makeRemoteProxyStub(
					ctx.props.remoteProxyConnectionString,
					ctx.props.binding,
					undefined,
					ctx.props.cfTraceId,
					env[SharedBindings.MAYBE_SERVICE_LOOPBACK]
				)
			: undefined;

		return new Proxy(this, {
			get: (target, prop) => {
				if (Reflect.has(target, prop)) {
					return Reflect.get(target, prop);
				}
				if (!stub) {
					throwRemoteRequired(ctx.props.binding);
				}
				return Reflect.get(stub, prop);
			},
		});
	}
}
