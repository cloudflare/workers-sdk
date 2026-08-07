import fs from "node:fs/promises";
import SCRIPT_KV_NAMESPACE_OBJECT from "worker:kv/namespace";
import { SharedBindings } from "../../workers";
import {
	buildObjectEntryProps,
	buildRemoteProxyProps,
	extractObjectEntryId,
	getEnvBindingsOfType,
	getMiniflareObjectBindings,
	getPersistPath,
	getRemoteProxyConnectionString,
	objectEntryWorker,
	ProxyNodeBinding,
	remoteProxyClientWorker,
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
import type {
	MiniflareBinding,
	ParsedWorkerOptions,
	Plugin,
} from "../shared";
import type { SitesOptions } from "./sites";

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
	options: ParsedWorkerOptions
): options is ParsedWorkerOptions & { legacy: SitesOptions } {
	return options.legacy?.sitePath !== undefined;
}

export const KV_PLUGIN: Plugin = {
	bindingTypeDescription: "KV namespace",
	async getBindings(options) {
		const namespaces = getEnvBindingsOfType(options.config, "kv");
		const bindings = namespaces.map<Worker_Binding>(([name, binding]) => {
			const id = binding.id;
			const remoteProxyConnectionString = getRemoteProxyConnectionString(
				binding,
				options.dev
			);
			// Remote (mixed-mode) namespaces share one proxy service; per-binding
			// config (connection string) travels via props.
			if (remoteProxyConnectionString) {
				return {
					name,
					kvNamespace: {
						name: KV_REMOTE_SERVICE_NAME,
						props: buildRemoteProxyProps(remoteProxyConnectionString, name),
					},
				};
			}
			// Local namespaces all share one entry service; the namespace id is
			// passed at runtime via props (read in object-entry.worker.ts).
			return {
				name,
				kvNamespace: {
					name: KV_LOCAL_ENTRY_SERVICE_NAME,
					props: buildObjectEntryProps(id),
				},
			};
		});

		if (isWorkersSitesEnabled(options)) {
			bindings.push(
				...(await getSitesBindings(options.legacy, options.dev?.rootPath))
			);
		}

		return bindings;
	},

	async getNodeBindings(options) {
		const namespaces = getEnvBindingsOfType(options.config, "kv");
		const bindings = Object.fromEntries(
			namespaces.map(([name]) => [name, new ProxyNodeBinding()])
		);

		if (isWorkersSitesEnabled(options)) {
			Object.assign(
				bindings,
				await getSitesNodeBindings(options.legacy, options.dev?.rootPath)
			);
		}

		return bindings;
	},

	async getServices({
		options,
		tmpPath,
		sharedOptions,
		storageOwnerRoutePlugins,
	}) {
		const namespaces = getEnvBindingsOfType(options.config, "kv");

		const services: Service[] = [];

		// When routing local KV to a shared storage owner, this instance must not
		// stand up its own KV storage (disk/DO/migrations) — its bindings are
		// repointed at the owner proxy by `Miniflare`. Sites are still served
		// locally as they aren't routed.
		const routeToOwner = storageOwnerRoutePlugins.has(KV_PLUGIN_NAME);

		// One shared entry service for all local namespaces (id supplied via props).
		const hasLocalNamespace = !routeToOwner && namespaces.some(
			([, binding]) => !getRemoteProxyConnectionString(binding, options.dev)
		);
		if (hasLocalNamespace) {
			services.push({
				name: KV_LOCAL_ENTRY_SERVICE_NAME,
				worker: objectEntryWorker(KV_NAMESPACE_OBJECT),
			});
		}

		// Remote bindings keep using this instance's per-plugin proxy service.
		const hasRemoteNamespace = namespaces.some(([, binding]) =>
			getRemoteProxyConnectionString(binding, options.dev)
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
				sharedOptions.resourcePersistencePath
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
			services.push(...getSitesServices(options.legacy, options.dev?.rootPath));
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
		const ownerBindings: Record<string, MiniflareBinding> = {};
		for (const options of allOptions) {
			for (const [, binding] of getEnvBindingsOfType(options.config, "kv")) {
				if (getRemoteProxyConnectionString(binding, options.dev) === undefined) {
					ownerBindings[`${KV_PLUGIN_NAME}:${binding.id}`] = binding;
				}
			}
		}
		if (Object.keys(ownerBindings).length === 0) {
			return undefined;
		}
		return { ownerBindings };
	},
};

export { KV_PLUGIN_NAME };
