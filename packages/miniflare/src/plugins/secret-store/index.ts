import fs from "node:fs/promises";
import SCRIPT_KV_NAMESPACE_OBJECT from "worker:kv/namespace";
import SCRIPT_SECRETS_STORE_SECRET from "worker:secrets-store/secret";
import { SharedBindings } from "../../workers";
import { KV_NAMESPACE_OBJECT_CLASS_NAME } from "../kv";
import {
	getEnvBindingsOfType,
	getMiniflareObjectBindings,
	getPersistPath,
	getUserBindingServiceName,
	objectEntryWorker,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
} from "../shared";
import type { Service, Worker_Binding } from "../../runtime";
import type { Plugin } from "../shared";

export const SECRET_STORE_PLUGIN_NAME = "secrets-store";

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
					entrypoint: "SecretsStoreSecret",
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
	async getServices({ options, tmpPath, resourcePersistencePath }) {
		const configs = getEnvBindingsOfType(
			options.config,
			"secrets-store-secret"
		).map(([, binding]) => binding);

		if (configs.length === 0) {
			return [];
		}

		const persistPath = getPersistPath(
			SECRET_STORE_PLUGIN_NAME,
			tmpPath,
			resourcePersistencePath
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
		const services = configs.flatMap<Service>((config) => {
			const kvNamespaceService = {
				name: `${SECRET_STORE_PLUGIN_NAME}:ns:${config.storeId}`,
				worker: objectEntryWorker(
					{
						serviceName: objectService.name,
						className: KV_NAMESPACE_OBJECT_CLASS_NAME,
					},
					config.storeId
				),
			} satisfies Service;
			const secretStoreSecretService = {
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
								name: kvNamespaceService.name,
							},
						},
						{
							name: "secret_name",
							json: JSON.stringify(config.secretName),
						},
					],
				},
			} satisfies Service;

			return [kvNamespaceService, secretStoreSecretService];
		});

		return [...services, storageService, objectService];
	},
};
