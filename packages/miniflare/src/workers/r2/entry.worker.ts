import { SharedBindings, SharedHeaders } from "../shared/constants";
import { R2Bindings, R2_WORKERD_SERVICE_NAME } from "./constants";
import type { WorkerdDebugPortConnector } from "../core/dev-registry-proxy-shared.worker";

interface Props {
	[SharedBindings.TEXT_NAMESPACE]?: string;
}
interface Env {
	[R2Bindings.DEBUG_PORT]: WorkerdDebugPortConnector;
}

// Routes R2's binding protocol to workerd's R2 for a bucket named at runtime,
// by props or the `MF-Namespace` header, which a binding's fixed props cannot
// do: the public and S3 endpoints, the local explorer and shared storage call
// this.
export default <ExportedHandler<Env, unknown, unknown, Props>>{
	fetch(request, env, ctx) {
		const bucket =
			ctx.props[SharedBindings.TEXT_NAMESPACE] ??
			request.headers.get(SharedHeaders.NAMESPACE);
		if (bucket === null) {
			throw new Error("r2:bucket:entry: no bucket in props or header");
		}
		const headers = new Headers(request.headers);
		headers.delete(SharedHeaders.NAMESPACE);
		const r2 = env[R2Bindings.DEBUG_PORT]
			.current()
			.getEntrypoint(R2_WORKERD_SERVICE_NAME, undefined, { bucket });
		return r2.fetch(new Request(request, { headers }));
	},
};
