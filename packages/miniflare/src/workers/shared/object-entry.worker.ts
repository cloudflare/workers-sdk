import { SharedBindings, SharedHeaders } from "./constants";
import type { MiniflareDurableObjectCf } from "./object.worker";

interface Props {
	[SharedBindings.TEXT_NAMESPACE]?: string;
}
interface Env {
	// Present only in the legacy per-resource model, where the namespace is baked
	// into the worker as a static binding.
	[SharedBindings.TEXT_NAMESPACE]?: string;
	[SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT]: DurableObjectNamespace;
}

export default <ExportedHandler<Env, unknown, unknown, Props>>{
	async fetch(request, env, ctx) {
		// Resolve the namespace, in priority order:
		//  1. `ctx.props` — props-based model: one entry service serves many
		//     namespaces (local bindings).
		//  2. The storage-owner header — the shared storage owner serves any
		//     resource id supplied per-request (it can't bake props per id).
		//  3. The static binding — legacy per-resource model.
		const name =
			ctx.props[SharedBindings.TEXT_NAMESPACE] ??
			request.headers.get(SharedHeaders.STORAGE_OWNER_NAMESPACE) ??
			env[SharedBindings.TEXT_NAMESPACE];
		if (name === undefined) {
			throw new Error(
				"object-entry worker: no namespace provided via props or binding"
			);
		}
		const objectNamespace = env[SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT];
		const id = objectNamespace.idFromName(name);
		const stub = objectNamespace.get(id);
		const cf: MiniflareDurableObjectCf = { miniflare: { name } };
		return await stub.fetch(request, { cf: cf as Record<string, unknown> });
	},
};
