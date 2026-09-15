import { WorkerEntrypoint } from "cloudflare:workers";
import { SharedBindings } from "../shared/constants";
import {
	makeRemoteProxyStub,
	throwRemoteRequired,
} from "../shared/remote-bindings-utils";
import type {
	RemoteBindingEnv,
	RemoteBindingProps,
} from "../shared/remote-bindings-utils";

/** Proxy client for dispatch namespace bindings. */
export default class DispatchNamespaceProxy extends WorkerEntrypoint<
	RemoteBindingEnv,
	RemoteBindingProps
> {
	get(
		name: string,
		args?: { [key: string]: unknown },
		options?: DynamicDispatchOptions
	): Fetcher {
		if (!this.ctx.props.remoteProxyConnectionString) {
			throwRemoteRequired(this.ctx.props.binding);
		}
		return makeRemoteProxyStub(
			this.ctx.props.remoteProxyConnectionString,
			this.ctx.props.binding,
			{
				"MF-Dispatch-Namespace-Options": JSON.stringify({
					name,
					args,
					options,
				}),
			},
			this.ctx.props.cfTraceId,
			this.env[SharedBindings.MAYBE_SERVICE_LOOPBACK]
		);
	}
}
