import { WorkerEntrypoint } from "cloudflare:workers";
import {
	makeRemoteProxyStub,
	RemoteBindingEnv,
	throwRemoteRequired,
} from "../shared/remote-bindings-utils";

/**
 * Proxy client for dispatch namespace bindings.
 *
 * Exposed as a service binding to the thin extension module. The extension
 * calls .get() via workerd RPC; .get() creates a capnweb stub with the
 * dispatch options baked in and returns it. Promise pipelining means
 * `namespace.get("worker").fetch(req)` works without awaiting.
 */
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
