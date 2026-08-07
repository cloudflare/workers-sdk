import fs from "node:fs/promises";
import SCRIPT_KV_NAMESPACE_OBJECT from "worker:kv/namespace";
import { z } from "zod";
import { PathSchema } from "../../shared";
import { SharedBindings } from "../../workers";
import { SERVICE_REMOTE_BINDINGS } from "../core";
import {
	buildObjectEntryProps,
	buildRemoteProxyProps,
	extractObjectEntryId,
	getMiniflareObjectBindings,
	getPersistPath,
	namespaceEntries,
	namespaceKeys,
	objectEntryWorker,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
	storageOwnerProxyDesignator,
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
				z.string(),
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
const SERVICE_NAMESPACE_PREFIX = `${KV_PLUGIN_NAME}:ns`;
// A single entry service shared by every *local* namespace. Each namespace's id
// is supplied per-binding via `ctx.props`, so one service serves all of them.
export const KV_LOCAL_ENTRY_SERVICE_NAME = `${KV_PLUGIN_NAME}:ns:entry`;
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

export const KV_PLUGIN: Plugin<typeof KVOptionsSchema> = {
	options: KVOptionsSchema,
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
						name: SERVICE_REMOTE_BINDINGS,
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
		tmpPath,
		resourcePersistencePath,
		storageOwnerRoutePlugins,
	}) {
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

		if (hasLocalNamespace) {
			const uniqueKey = `miniflare-${KV_NAMESPACE_OBJECT_CLASS_NAME}`;
			const persistPath = getPersistPath(
				KV_PLUGIN_NAME,
				tmpPath,
				resourcePersistencePath
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
						...getMiniflareObjectBindings(),
					],
				},
			};
			services.push(storageService, objectService);
		}

		if (isWorkersSitesEnabled(options)) {
			services.push(...getSitesServices(options));
		}

		return services;
	},

	routeBindingToStorageOwner(binding) {
		if ("kvNamespace" in binding && binding.kvNamespace?.name !== undefined) {
			const id = extractObjectEntryId(binding.kvNamespace.props?.json);
			if (id !== undefined) {
				return {
					name: binding.name,
					// The owner runs the same KV plugin code, so its generic entry
					// service is `KV_LOCAL_ENTRY_SERVICE_NAME`; the id travels as props
					// (read by `object-entry.worker.ts` via `ctx.props`).
					kvNamespace: storageOwnerProxyDesignator(
						KV_LOCAL_ENTRY_SERVICE_NAME,
						undefined,
						{ [SharedBindings.TEXT_NAMESPACE]: id }
					),
				};
			}
		}
		return undefined;
	},

	getStorageOwnerHosting(allOptions) {
		const ids = new Set<string>();
		for (const options of allOptions) {
			for (const [, ns] of namespaceEntries(options.kvNamespaces)) {
				if (!ns.remoteProxyConnectionString) {
					ids.add(ns.id);
				}
			}
		}
		if (ids.size === 0) {
			return undefined;
		}
		// The owner stands up the same generic entry service; it serves any id
		// (routed by `idFromName`), so listing the ids is enough.
		return {
			ownerOptions: { kvNamespaces: [...ids] },
		};
	},
};

export { KV_PLUGIN_NAME };
