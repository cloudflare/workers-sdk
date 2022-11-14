import { z } from "zod";
import { Service, Worker_Binding } from "../../runtime";
import { SERVICE_LOOPBACK } from "../core";
import {
	BINDING_SERVICE_LOOPBACK,
	BINDING_TEXT_NAMESPACE,
	BINDING_TEXT_PLUGIN,
	PersistenceSchema,
	Plugin,
	SCRIPT_PLUGIN_NAMESPACE_PERSIST,
	encodePersist,
} from "../shared";
import { KV_PLUGIN_NAME } from "./constants";
import { KVGateway } from "./gateway";
import { KVRemoteStorage } from "./remote";
import { KVRouter } from "./router";
import { SitesOptions, getSitesBindings, getSitesService } from "./sites";

export const KVOptionsSchema = z.object({
	// TODO: also allow array like Miniflare 2
	kvNamespaces: z.record(z.string()).optional(),

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
		const bindings = Object.entries(
			options.kvNamespaces ?? {}
		).map<Worker_Binding>(([name, id]) => ({
			name,
			kvNamespace: { name: `${SERVICE_NAMESPACE_PREFIX}:${id}` },
		}));

		if (isWorkersSitesEnabled(options)) {
			bindings.push(...(await getSitesBindings(options)));
		}

		return bindings;
	},
	getServices({ options, sharedOptions }) {
		const persistBinding = encodePersist(sharedOptions.kvPersist);
		const services = Object.entries(options.kvNamespaces ?? []).map<Service>(
			([_, id]) => ({
				name: `${SERVICE_NAMESPACE_PREFIX}:${id}`,
				worker: {
					serviceWorkerScript: SCRIPT_PLUGIN_NAMESPACE_PERSIST,
					compatibilityDate: "2022-09-01",
					bindings: [
						...persistBinding,
						{ name: BINDING_TEXT_PLUGIN, text: KV_PLUGIN_NAME },
						{ name: BINDING_TEXT_NAMESPACE, text: id },
						{
							name: BINDING_SERVICE_LOOPBACK,
							service: { name: SERVICE_LOOPBACK },
						},
					],
				},
			})
		);

		if (isWorkersSitesEnabled(options)) {
			services.push(getSitesService(options));
		}

		return services;
	},
};

export * from "./gateway";
export { maybeGetSitesManifestModule } from "./sites";
export { KV_PLUGIN_NAME };
