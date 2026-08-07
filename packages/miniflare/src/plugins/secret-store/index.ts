import fs from "node:fs/promises";
import SCRIPT_KV_NAMESPACE_OBJECT from "worker:kv/namespace";
import SCRIPT_SECRETS_STORE_SECRET from "worker:secrets-store/secret";
import { SharedBindings } from "../../workers";
import { KV_NAMESPACE_OBJECT_CLASS_NAME } from "../kv";
import {
	buildObjectEntryProps,
	getEnvBindingsOfType,
	getMiniflareObjectBindings,
	getPersistPath,
	getUserBindingServiceName,
	objectEntryWorker,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
	storageOwnerProxyDesignator,
} from "../shared";
import type { Service, Worker_Binding } from "../../runtime";
import type { Plugin } from "../shared";

export const SECRET_STORE_PLUGIN_NAME = "secrets-store";
// A single entry service shared by every secret store. Each store_id is supplied
// per-binding via `ctx.props`, so one service serves all of them.
const SECRET_STORE_LOCAL_ENTRY_SERVICE_NAME = `${SECRET_STORE_PLUGIN_NAME}:ns:entry`;
export const SECRET_STORE_SECRET_ENTRYPOINT = "SecretsStoreSecret";

export const SECRET_STORE_PLUGIN: Plugin = {
	bindingTypeDescription: "Secrets Store secret",
	async getBindings(options) {
		return getEnvBindingsOfType(
			options.config,
			"secrets-store-secret"
		).map<Worker_Binding>(([name, binding]) => {
			return {
				name,
				service: {
					name: getUserBindingServiceName(
						SECRET_STORE_PLUGIN_NAME,
						`${binding.storeId}:${binding.secretName}`
					),
					entrypoint: SECRET_STORE_SECRET_ENTRYPOINT,
				},
			};
		});
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "secrets-store-secret").map(
				([name]) => [name, new ProxyNodeBinding()]
			)
		);
	},
	async getServices({
		options,
		tmpPath,
		sharedOptions,
		storageOwnerRoutePlugins,
	}) {
		const configs = getEnvBindingsOfType(
			options.config,
			"secrets-store-secret"
		).map(([, binding]) => binding);

		if (configs.length === 0) {
			return [];
		}

		if (storageOwnerRoutePlugins.has(SECRET_STORE_PLUGIN_NAME)) {
			return [];
		}

		const persistPath = getPersistPath(
			SECRET_STORE_PLUGIN_NAME,
			tmpPath,
			sharedOptions.resourcePersistencePath
		);

		await fs.mkdir(persistPath, { recursive: true });

		const storageService = {
			name: `${SECRET_STORE_PLUGIN_NAME}:storage`,
			disk: { path: persistPath, writable: true },
		} satisfies Service;
		const objectService = {
			name: `${SECRET_STORE_PLUGIN_NAME}:ns`,
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
					{
						className: KV_NAMESPACE_OBJECT_CLASS_NAME,
						uniqueKey: `miniflare-secrets-store-${KV_NAMESPACE_OBJECT_CLASS_NAME}`,
					},
				],
				// Store Durable Object SQL databases in persist path
				durableObjectStorage: { localDisk: storageService.name },
				// Bind blob disk directory service to object
				bindings: [
					{
						name: SharedBindings.MAYBE_SERVICE_BLOBS,
						service: { name: storageService.name },
					},
					{
						name: SharedBindings.MAYBE_SERVICE_LOOPBACK,
						service: { name: SERVICE_LOOPBACK },
					},
					...getMiniflareObjectBindings(),
				],
			},
		} satisfies Service;
		// One shared entry service; each store_id is supplied per-binding via props.
		const entryService = {
			name: SECRET_STORE_LOCAL_ENTRY_SERVICE_NAME,
			worker: objectEntryWorker({
				serviceName: objectService.name,
				className: KV_NAMESPACE_OBJECT_CLASS_NAME,
			}),
		} satisfies Service;
		const secretServices = configs.map<Service>((config) => ({
			name: getUserBindingServiceName(
				SECRET_STORE_PLUGIN_NAME,
				`${config.storeId}:${config.secretName}`
			),
			worker: {
				compatibilityDate: "2025-01-01",
				modules: [
					{
						name: "secret.worker.js",
						esModule: SCRIPT_SECRETS_STORE_SECRET(),
					},
				],
				bindings: [
					{
						name: "store",
						kvNamespace: {
							name: SECRET_STORE_LOCAL_ENTRY_SERVICE_NAME,
							props: buildObjectEntryProps(config.storeId),
						},
					},
					{
						name: "secret_name",
						json: JSON.stringify(config.secretName),
					},
				],
			},
		}));

		return [...secretServices, entryService, storageService, objectService];
	},
	routeBindingToStorageOwner(binding) {
		if ("service" in binding && binding.service?.name !== undefined) {
			return {
				name: binding.name,
				service: storageOwnerProxyDesignator(
					binding.service.name,
					binding.service.entrypoint
				),
			};
		}
		return undefined;
	},
	getStorageOwnerHosting(allOptions) {
		const secrets = new Map<
			string,
			{ type: "secrets-store-secret"; storeId: string; secretName: string }
		>();
		for (const options of allOptions) {
			for (const [, binding] of getEnvBindingsOfType(
				options.config,
				"secrets-store-secret"
			)) {
				secrets.set(`${binding.storeId}:${binding.secretName}`, binding);
			}
		}
		if (secrets.size === 0) {
			return undefined;
		}
		return {
			ownerBindings: Object.fromEntries(
				[...secrets.entries()].map(([resource, binding]) => [
					`owner:${resource}`,
					binding,
				])
			),
		};
	},
};
