import { SharedBindings } from "./constants";
import type { MiniflareDurableObjectCf } from "./object.worker";

interface Env {
	[SharedBindings.TEXT_NAMESPACE]: string;
	[SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT]: DurableObjectNamespace;
}

export default <ExportedHandler<Env>>{
	async fetch(request, env) {
		const name = env[SharedBindings.TEXT_NAMESPACE];
		const objectNamespace = env[SharedBindings.DURABLE_OBJECT_NAMESPACE_OBJECT];
		const id = objectNamespace.idFromName(name);
		const stub = objectNamespace.get(id);
		const cf: MiniflareDurableObjectCf = { miniflare: { name } };
		return await stub.fetch(request, { cf: cf as Record<string, unknown> });
	},
};
