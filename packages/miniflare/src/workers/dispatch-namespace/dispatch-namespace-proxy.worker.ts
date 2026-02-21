import { WorkerEntrypoint } from "cloudflare:workers";
import {
	makeRemoteProxyStub,
	RemoteBindingEnv,
	throwRemoteRequired,
} from "../shared/remote-bindings-utils";

/** Proxy client for dispatch namespace bindings. */
export default class DispatchNamespaceProxy extends WorkerEntrypoint<RemoteBindingEnv> {
	get(
		name: string,
		args?: { [key: string]: unknown },
		options?: DynamicDispatchOptions
	): Fetcher {
		if (!this.env.remoteProxyConnectionString) {
			throwRemoteRequired(this.env.binding);
		}
		return makeRemoteProxyStub(
			this.env.remoteProxyConnectionString,
			this.env.binding,
			{
				"MF-Dispatch-Namespace-Options": JSON.stringify({
					name,
					args,
					options,
				}),
			}
		);
	}
}
