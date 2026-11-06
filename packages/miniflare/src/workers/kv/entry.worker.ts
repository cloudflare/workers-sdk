import { SharedBindings, SharedHeaders } from "../shared/constants";
import { KVBindings, KV_WORKERD_SERVICE_NAME } from "./constants";
import type { WorkerdDebugPortConnector } from "../core/dev-registry-proxy-shared.worker";

interface Props {
	[SharedBindings.TEXT_NAMESPACE]?: string;
}
interface Env {
	[KVBindings.DEBUG_PORT]: WorkerdDebugPortConnector;
}

// Routes KV's HTTP protocol to workerd's KV for a namespace named at
// runtime, by props or the `MF-Namespace` header, which a binding's fixed
// props cannot do: the local explorer and shared storage call this.
export default <ExportedHandler<Env, unknown, unknown, Props>>{
	fetch(request, env, ctx) {
		const namespace =
			ctx.props[SharedBindings.TEXT_NAMESPACE] ??
			request.headers.get(SharedHeaders.NAMESPACE);
		if (namespace === null) {
			throw new Error("kv:ns:entry: no namespace in props or header");
		}
		const headers = new Headers(request.headers);
		headers.delete(SharedHeaders.NAMESPACE);
		const kv = env[KVBindings.DEBUG_PORT]
			.current()
			.getEntrypoint(KV_WORKERD_SERVICE_NAME, undefined, { namespace });
		return kv.fetch(new Request(request, { headers }));
	},
};
