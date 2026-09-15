import { SharedBindings } from "miniflare:shared";
import { CacheHeaders } from "./constants";
import type { MiniflareDurableObjectCf } from "miniflare:shared";

interface Env {
	[SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT]: DurableObjectNamespace;
}

export default <ExportedHandler<Env>>{
	async fetch(request, env) {
		const namespace = request.headers.get(CacheHeaders.NAMESPACE);
		const name = namespace === null ? "default" : `named:${namespace}`;

		const objectNamespace = env[SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT];
		const id = objectNamespace.idFromName(name);
		const stub = objectNamespace.get(id);
		const cf: MiniflareDurableObjectCf = {
			...request.cf,
			miniflare: {
				name,
			},
		};
		return await stub.fetch(request, { cf: cf as Record<string, unknown> });
	},
};
