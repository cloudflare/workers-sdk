import { WorkerEntrypoint } from "cloudflare:workers";
import {
	makeRemoteProxyStub,
	RemoteBindingEnv,
	throwRemoteRequired,
} from "../shared/remote-bindings-utils";

/**
 * WorkerEntrypoint for dispatch namespace bindings.
 *
 * Unlike the generic remote-proxy-client, this worker has a custom `.get()`
 * method that creates a local stub with dispatch options baked in. This
 * ensures `.get()` is synchronous and options are passed correctly.
 *
 * Promise pipelining means `namespace.get("worker").fetch(request)` works
 * without awaiting `.get()`.
 */
export default class DispatchNamespaceBinding extends WorkerEntrypoint<RemoteBindingEnv> {
	get(
		name: string,
		args?: { [key: string]: unknown },
		options?: DynamicDispatchOptions
	): Fetcher {
		if (!this.env.remoteProxyConnectionString) {
			throwRemoteRequired(this.env.binding);
		}
		// Create a local stub with dispatch options embedded - this is NOT an RPC
		// call to the server. The options are passed when .fetch() is called.
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
