import fs from "node:fs/promises";
import SCRIPT_KV_NAMESPACE_OBJECT from "worker:kv/namespace";
import SCRIPT_SECRETS_STORE_SECRET from "worker:secrets-store/secret";
import { z } from "zod";
import { Service, Worker_Binding } from "../../runtime";
import { SharedBindings } from "../../workers";
import { KV_NAMESPACE_OBJECT_CLASS_NAME } from "../kv";
import {
	getMiniflareObjectBindings,
	getPersistPath,
	getUserBindingServiceName,
	objectEntryWorker,
	PersistenceSchema,
	Plugin,
	ProxyNodeBinding,
	SERVICE_LOOPBACK,
} from "../shared";

const SecretsStoreSecretsSchema = z.record(
	z.object({
		store_id: z.string(),
		secret_name: z.string(),
	})
);

export const SecretsStoreSecretsOptionsSchema = z.object({
	secretsStoreSecrets: SecretsStoreSecretsSchema.optional(),
});

export const SecretsStoreSecretsSharedOptionsSchema = z.object({
	secretsStorePersist: PersistenceSchema,
});

export const SECRET_STORE_PLUGIN_NAME = "secrets-store";

export const SECRET_STORE_PLUGIN: Plugin<
	typeof SecretsStoreSecretsOptionsSchema,
	typeof SecretsStoreSecretsSharedOptionsSchema
> = {
	options: SecretsStoreSecretsOptionsSchema,
	sharedOptions: SecretsStoreSecretsSharedOptionsSchema,
	async getBindings(options) {
		if (!options.secretsStoreSecrets) {
			return [];
		}

		const bindings = Object.entries(
			options.secretsStoreSecrets
		).map<Worker_Binding>(([name, config]) => {
			return {
				name,
				service: {
					name: getUserBindingServiceName(
						SECRET_STORE_PLUGIN_NAME,
						`${config.store_id}:${config.secret_name}`
					),
					entrypoint: "SecretsStoreSecret",
				},
			};
		});
		return bindings;
	},
	getNodeBindings(options: z.infer<typeof SecretsStoreSecretsOptionsSchema>) {
		if (!options.secretsStoreSecrets) {
			return {};
		}
		return Object.fromEntries(
			Object.keys(options.secretsStoreSecrets).map((name) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({
		options,
		sharedOptions,
		tmpPath,
		defaultPersistRoot,
		unsafeStickyBlobs,
	}) {
		const configs = options.secretsStoreSecrets
			? Object.values(options.secretsStoreSecrets)
			: [];

		if (configs.length === 0) {
			return [];
		}

		const persistPath = getPersistPath(
			SECRET_STORE_PLUGIN_NAME,
			tmpPath,
			defaultPersistRoot,
			sharedOptions.secretsStorePersist
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
					...getMiniflareObjectBindings(unsafeStickyBlobs),
				],
			},
		} satisfies Service;
		const services = configs.flatMap<Service>((config) => {
			const kvNamespaceService = {
				name: `${SECRET_STORE_PLUGIN_NAME}:ns:${config.store_id}`,
				worker: objectEntryWorker(
					{
						serviceName: objectService.name,
						className: KV_NAMESPACE_OBJECT_CLASS_NAME,
					},
					config.store_id
				),
			} satisfies Service;
			const secretStoreSecretService = {
				name: getUserBindingServiceName(
					SECRET_STORE_PLUGIN_NAME,
					`${config.store_id}:${config.secret_name}`
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
							json: JSON.stringify(config.secret_name),
						},
					],
				},
			} satisfies Service;

			return [kvNamespaceService, secretStoreSecretService];
		});

		return [...services, storageService, objectService];
	},
	getPersistPath({ secretsStorePersist }, tmpPath) {
		return getPersistPath(
			SECRET_STORE_PLUGIN_NAME,
			tmpPath,
			undefined,
			secretsStorePersist
		);
	},
};
