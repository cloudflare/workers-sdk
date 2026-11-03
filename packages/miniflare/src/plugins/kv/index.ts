import SCRIPT_KV_ENTRY from "worker:kv/entry";
import { kVoid } from "../../runtime";
import {
	KV_LOCAL_ENTRY_SERVICE_NAME,
	KVBindings,
} from "../../workers/kv/constants";
import {
	buildObjectEntryProps,
	buildRemoteProxyProps,
	getBuiltinStorageService,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	getStorageService,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import { KV_PLUGIN_NAME } from "./constants";
import {
	getSitesBindings,
	getSitesNodeBindings,
	getSitesServices,
} from "./sites";
import type { Service, Worker_Binding } from "../../runtime";
import type { ParsedWorkerOptions, Plugin } from "../shared";
import type { SitesOptions } from "./sites";

// One shared remote-proxy service for all remote namespaces (config via props).
const KV_REMOTE_SERVICE_NAME = `${KV_PLUGIN_NAME}:ns:remote`;
// The Durable Object class of `worker:kv/namespace`, which the secrets store
// and images plugins still use.
export const KV_NAMESPACE_OBJECT_CLASS_NAME = "KVNamespaceObject";

function isWorkersSitesEnabled(
	options: ParsedWorkerOptions
): options is ParsedWorkerOptions & { legacy: SitesOptions } {
	return options.legacy?.sitePath !== undefined;
}

export const KV_PLUGIN: Plugin = {
	bindingTypeDescription: "KV namespace",
	async getBindings(options, sharedOptions) {
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
			// Local namespaces are workerd's built-in KV. With shared storage they
			// go through the storage owner's entry service instead.
			if (!sharedOptions.unsafeEnableSharedStorage) {
				return { name, kvNamespaceId: id };
			}
			return {
				name,
				kvNamespace: getStorageService(
					KV_LOCAL_ENTRY_SERVICE_NAME,
					buildObjectEntryProps(id),
					sharedOptions
				),
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

	async getServices({ options, tmpPath, sharedOptions }) {
		const namespaces = getEnvBindingsOfType(options.config, "kv");

		const services: Service[] = [];

		// The entry service reaches the built-in KV of a namespace named at
		// runtime, for the local explorer and shared storage. `builtinStorage`
		// alone makes workerd add the built-in `workerd:kv`.
		const hasLocalNamespace =
			namespaces.some(
				([, binding]) => !getRemoteProxyConnectionString(binding, options.dev)
			) ||
			sharedOptions.unsafeEnableSharedStorage ||
			sharedOptions.unsafeLocalExplorer;
		if (hasLocalNamespace) {
			services.push(
				{
					name: KV_LOCAL_ENTRY_SERVICE_NAME,
					worker: {
						compatibilityDate: "2025-01-01",
						modules: [{ name: "entry.worker.js", esModule: SCRIPT_KV_ENTRY() }],
						bindings: [
							{ name: KVBindings.DEBUG_PORT, workerdDebugPort: kVoid },
						],
					},
				},
				await getBuiltinStorageService(
					tmpPath,
					sharedOptions.resourcePersistencePath
				)
			);
		}

		// One shared proxy service for all remote (mixed-mode) namespaces.
		const hasRemoteNamespace = namespaces.some(([, binding]) =>
			getRemoteProxyConnectionString(binding, options.dev)
		);
		if (hasRemoteNamespace) {
			services.push({
				name: KV_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			});
		}

		if (isWorkersSitesEnabled(options)) {
			services.push(...getSitesServices(options.legacy, options.dev?.rootPath));
		}

		return services;
	},
};

export { KV_PLUGIN_NAME };
