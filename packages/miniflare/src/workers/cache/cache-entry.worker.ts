import { MiniflareDurableObjectCf, SharedBindings } from "miniflare:shared";

import { CacheBindings, CacheHeaders, CacheObjectCf } from "./constants";

interface Env {
	[SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT]: DurableObjectNamespace;
	[CacheBindings.MAYBE_JSON_CACHE_WARN_USAGE]?: boolean;
}

export default (<ExportedHandler<Env>>{
	async fetch(request, env) {
		const namespace = request.headers.get(CacheHeaders.NAMESPACE);
		const name = namespace === null ? "default" : `named:${namespace}`;

		const objectNamespace = env[SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT];
		const id = objectNamespace.idFromName(name);
		const stub = objectNamespace.get(id);
		const cf: MiniflareDurableObjectCf & CacheObjectCf = {
			...request.cf,
			miniflare: {
				name,
				cacheWarnUsage: env[CacheBindings.MAYBE_JSON_CACHE_WARN_USAGE],
			},
		};
		return await stub.fetch(request, { cf: cf as Record<string, unknown> });
	},
});
