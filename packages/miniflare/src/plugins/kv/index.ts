import { z } from "zod";
import { Service, Worker_Binding } from "../../runtime";
import {
	PersistenceSchema,
	Plugin,
	namespaceEntries,
	pluginNamespacePersistWorker,
} from "../shared";
import { KV_PLUGIN_NAME } from "./constants";
import { KVGateway } from "./gateway";
import { KVRemoteStorage } from "./remote";
import { KVRouter } from "./router";
import { SitesOptions, getSitesBindings, getSitesService } from "./sites";

export const KVOptionsSchema = z.object({
	kvNamespaces: z.union([z.record(z.string()), z.string().array()]).optional(),

	// Workers Sites
	sitePath: z.string().optional(),
	siteInclude: z.string().array().optional(),
	siteExclude: z.string().array().optional(),
});
export const KVSharedOptionsSchema = z.object({
	kvPersist: PersistenceSchema,
});

const SERVICE_NAMESPACE_PREFIX = `${KV_PLUGIN_NAME}:ns`;

function isWorkersSitesEnabled(
	options: z.infer<typeof KVOptionsSchema>
): options is SitesOptions {
	return options.sitePath !== undefined;
}

export const KV_PLUGIN: Plugin<
	typeof KVOptionsSchema,
	typeof KVSharedOptionsSchema,
	KVGateway
> = {
	gateway: KVGateway,
	router: KVRouter,
	remoteStorage: KVRemoteStorage,
	options: KVOptionsSchema,
	sharedOptions: KVSharedOptionsSchema,
	async getBindings(options) {
		const namespaces = namespaceEntries(options.kvNamespaces);
		const bindings = namespaces.map<Worker_Binding>(([name, id]) => ({
			name,
			kvNamespace: { name: `${SERVICE_NAMESPACE_PREFIX}:${id}` },
		}));

		if (isWorkersSitesEnabled(options)) {
			bindings.push(...(await getSitesBindings(options)));
		}

		return bindings;
	},
	getServices({ options, sharedOptions }) {
		const persist = sharedOptions.kvPersist;
		const namespaces = namespaceEntries(options.kvNamespaces);
		const services = namespaces.map<Service>(([_, id]) => ({
			name: `${SERVICE_NAMESPACE_PREFIX}:${id}`,
			worker: pluginNamespacePersistWorker(KV_PLUGIN_NAME, id, persist),
		}));

		if (isWorkersSitesEnabled(options)) {
			services.push(getSitesService(options));
		}

		return services;
	},
};

export * from "./gateway";
export { maybeGetSitesManifestModule, isSitesRequest } from "./sites";
export { KV_PLUGIN_NAME };
