import fs from "node:fs/promises";
import SCRIPT_KV_NAMESPACE_OBJECT from "worker:kv/namespace";
import { z } from "zod";
import { PathSchema } from "../../shared";
import { SharedBindings } from "../../workers";
import {
	buildObjectEntryProps,
	buildRemoteProxyProps,
	getMiniflareObjectBindings,
	getPersistPath,
	migrateDatabase,
	namespaceEntries,
	namespaceKeys,
	objectEntryWorker,
	PersistenceSchema,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	SERVICE_LOOPBACK,
} from "../shared";
import { KV_PLUGIN_NAME } from "./constants";
import {
	getSitesBindings,
	getSitesNodeBindings,
	getSitesServices,
} from "./sites";
import type {
	Service,
	Worker_Binding,
	Worker_Binding_DurableObjectNamespaceDesignator,
} from "../../runtime";
import type { Plugin, RemoteProxyConnectionString } from "../shared";
import type { SitesOptions } from "./sites";

export const KVOptionsSchema = z.object({
	kvNamespaces: z
		.union([
			z.record(
				z.union([
					z.string(),
					z.object({
						id: z.string(),
						remoteProxyConnectionString: z
							.custom<RemoteProxyConnectionString>()
							.optional(),
					}),
				])
			),
			z.string().array(),
		])
		.optional(),

	// Workers Sites
	sitePath: PathSchema.optional(),
	siteInclude: z.string().array().optional(),
	siteExclude: z.string().array().optional(),
});
export const KVSharedOptionsSchema = z.object({
	kvPersist: PersistenceSchema,
});

const SERVICE_NAMESPACE_PREFIX = `${KV_PLUGIN_NAME}:ns`;
// A single entry service shared by every *local* namespace. Each namespace's id
// is supplied per-binding via `ctx.props`, so one service serves all of them.
export const KV_LOCAL_ENTRY_SERVICE_NAME = `${KV_PLUGIN_NAME}:ns:entry`;
// One shared remote-proxy service for all remote namespaces (config via props).
const KV_REMOTE_SERVICE_NAME = `${KV_PLUGIN_NAME}:ns:remote`;
const KV_STORAGE_SERVICE_NAME = `${KV_PLUGIN_NAME}:storage`;
export const KV_NAMESPACE_OBJECT_CLASS_NAME = "KVNamespaceObject";
const KV_NAMESPACE_OBJECT: Worker_Binding_DurableObjectNamespaceDesignator = {
	serviceName: SERVICE_NAMESPACE_PREFIX,
	className: KV_NAMESPACE_OBJECT_CLASS_NAME,
};

function isWorkersSitesEnabled(
	options: z.infer<typeof KVOptionsSchema>
): options is SitesOptions {
	return options.sitePath !== undefined;
}

export const KV_PLUGIN: Plugin<
	typeof KVOptionsSchema,
	typeof KVSharedOptionsSchema
> = {
	options: KVOptionsSchema,
	sharedOptions: KVSharedOptionsSchema,
	bindingTypeDescription: "KV namespace",
	async getBindings(options) {
		const namespaces = namespaceEntries(options.kvNamespaces);
		const bindings = namespaces.map<Worker_Binding>(([name, namespace]) => {
			// Remote (mixed-mode) namespaces share one proxy service; per-binding
			// config (connection string) travels via props.
			if (namespace.remoteProxyConnectionString) {
				return {
					name,
					kvNamespace: {
						name: KV_REMOTE_SERVICE_NAME,
						props: buildRemoteProxyProps(
							namespace.remoteProxyConnectionString,
							name
						),
					},
				};
			}
			// Local namespaces all share one entry service; the namespace id is
			// passed at runtime via props (read in object-entry.worker.ts).
			return {
				name,
				kvNamespace: {
					name: KV_LOCAL_ENTRY_SERVICE_NAME,
					props: buildObjectEntryProps(namespace.id),
				},
			};
		});

		if (isWorkersSitesEnabled(options)) {
			bindings.push(...(await getSitesBindings(options)));
		}

		return bindings;
	},

	async getNodeBindings(options) {
		const namespaces = namespaceKeys(options.kvNamespaces);
		const bindings = Object.fromEntries(
			namespaces.map((name) => [name, new ProxyNodeBinding()])
		);

		if (isWorkersSitesEnabled(options)) {
			Object.assign(bindings, await getSitesNodeBindings(options));
		}

		return bindings;
	},

	async getServices({
		options,
		sharedOptions,
		tmpPath,
		defaultPersistRoot,
		log,
		unsafeStickyBlobs,
		storageOwnerRoutePlugins,
	}) {
		const persist = sharedOptions.kvPersist;
		const namespaces = namespaceEntries(options.kvNamespaces);

		const services: Service[] = [];

		// When routing local KV to a shared storage owner, this instance must not
		// stand up its own KV storage (disk/DO/migrations) — its bindings are
		// repointed at the owner proxy by `Miniflare`. Sites are still served
		// locally as they aren't routed.
		const routeToOwner = storageOwnerRoutePlugins.has(KV_PLUGIN_NAME);

		// One shared entry service for all local namespaces (id supplied via props).
		const hasLocalNamespace =
			!routeToOwner &&
			namespaces.some(([, ns]) => !ns.remoteProxyConnectionString);
		if (hasLocalNamespace) {
			services.push({
				name: KV_LOCAL_ENTRY_SERVICE_NAME,
				worker: objectEntryWorker(KV_NAMESPACE_OBJECT),
			});
		}

		// One shared proxy service for all remote (mixed-mode) namespaces.
		const hasRemoteNamespace = namespaces.some(
			([, ns]) => ns.remoteProxyConnectionString
		);
		if (hasRemoteNamespace) {
			services.push({
				name: KV_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			});
		}

		if (hasLocalNamespace) {
			const uniqueKey = `miniflare-${KV_NAMESPACE_OBJECT_CLASS_NAME}`;
			const persistPath = getPersistPath(
				KV_PLUGIN_NAME,
				tmpPath,
				defaultPersistRoot,
				persist
			);
			await fs.mkdir(persistPath, { recursive: true });
			const storageService: Service = {
				name: KV_STORAGE_SERVICE_NAME,
				disk: { path: persistPath, writable: true },
			};
			const objectService: Service = {
				name: SERVICE_NAMESPACE_PREFIX,
				worker: {
					compatibilityDate: "2023-07-24",
					compatibilityFlags: ["nodejs_compat", "experimental"],
					modules: [
						{
							name: "namespace.worker.js",
							esModule: SCRIPT_KV_NAMESPACE_OBJECT(),
						},
					],
					durableObjectNamespaces: [
						{ className: KV_NAMESPACE_OBJECT_CLASS_NAME, uniqueKey },
					],
					// Store Durable Object SQL databases in persist path
					durableObjectStorage: { localDisk: KV_STORAGE_SERVICE_NAME },
					// Bind blob disk directory service to object
					bindings: [
						{
							name: SharedBindings.MAYBE_SERVICE_BLOBS,
							service: { name: KV_STORAGE_SERVICE_NAME },
						},
						{
							name: SharedBindings.MAYBE_SERVICE_LOOPBACK,
							service: { name: SERVICE_LOOPBACK },
						},
						...getMiniflareObjectBindings(unsafeStickyBlobs),
					],
				},
			};
			services.push(storageService, objectService);

			// Before the switch to Durable Object simulators, Miniflare stored
			// databases alongside blobs in a namespace specific directory. To avoid
			// another breaking change to the persistence location, migrate SQLite
			// databases from the old location to the new location. Blobs are still
			// stored in the same location.
			for (const [, namespace] of namespaces) {
				if (namespace.remoteProxyConnectionString) {
					continue;
				}
				await migrateDatabase(log, uniqueKey, persistPath, namespace.id);
			}
		}

		if (isWorkersSitesEnabled(options)) {
			services.push(...getSitesServices(options));
		}

		return services;
	},

	getPersistPath({ kvPersist }, tmpPath) {
		return getPersistPath(KV_PLUGIN_NAME, tmpPath, undefined, kvPersist);
	},
};

export { KV_PLUGIN_NAME };
