import fs from "node:fs/promises";
import SCRIPT_KV_NAMESPACE_OBJECT from "worker:kv/namespace";
import SCRIPT_SECRETS_STORE_SECRET from "worker:secrets-store/secret";
import { z } from "zod";
import { SharedBindings } from "../../workers";
import { KV_NAMESPACE_OBJECT_CLASS_NAME } from "../kv";
import {
	buildObjectEntryProps,
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

const SecretsStoreSecretsSchema = z.record(
	z.string(),
	z.object({
		store_id: z.string(),
		secret_name: z.string(),
	})
);

export const SecretsStoreSecretsOptionsSchema = z.object({
	secretsStoreSecrets: SecretsStoreSecretsSchema.optional(),
});

export const SECRET_STORE_PLUGIN_NAME = "secrets-store";
// A single entry service shared by every secret store. Each store_id is supplied
// per-binding via `ctx.props`, so one service serves all of them.
const SECRET_STORE_LOCAL_ENTRY_SERVICE_NAME = `${SECRET_STORE_PLUGIN_NAME}:ns:entry`;
// RPC entrypoint exposing a single secret. Referenced by the shared storage
// owner so it can route a client's Secrets Store binding here.
export const SECRET_STORE_SECRET_ENTRYPOINT = "SecretsStoreSecret";

export const SECRET_STORE_PLUGIN: Plugin<
	typeof SecretsStoreSecretsOptionsSchema
> = {
	options: SecretsStoreSecretsOptionsSchema,
	bindingTypeDescription: "Secrets Store secret",
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
					entrypoint: SECRET_STORE_SECRET_ENTRYPOINT,
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
		tmpPath,
		resourcePersistencePath,
		storageOwnerRoutePlugins,
	}) {
		const configs = options.secretsStoreSecrets
			? Object.values(options.secretsStoreSecrets)
			: [];

		if (configs.length === 0) {
			return [];
		}

		// Routed to the shared storage owner: the owner stands up the secret
		// services; this instance's bindings are repointed at the owner proxy.
		if (storageOwnerRoutePlugins.has(SECRET_STORE_PLUGIN_NAME)) {
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
							name: SECRET_STORE_LOCAL_ENTRY_SERVICE_NAME,
							props: buildObjectEntryProps(config.store_id),
						},
					},
					{
						name: "secret_name",
						json: JSON.stringify(config.secret_name),
					},
				],
			},
		}));

		return [...secretServices, entryService, storageService, objectService];
	},
	routeBindingToStorageOwner(binding) {
		// Per-secret RPC service. The owner exposes each secret under the same
		// service name (derived from `<store_id>:<secret_name>`, not the binding
		// key), so repoint at the client proxy targeting that same service +
		// entrypoint — reached natively over the owner's debug port.
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
		// Dedupe by "<store_id>:<secret_name>" across all workers.
		const secrets = new Map<
			string,
			{ store_id: string; secret_name: string }
		>();
		for (const options of allOptions) {
			if (!options.secretsStoreSecrets) {
				continue;
			}
			for (const { store_id, secret_name } of Object.values(
				options.secretsStoreSecrets
			)) {
				secrets.set(`${store_id}:${secret_name}`, { store_id, secret_name });
			}
		}
		if (secrets.size === 0) {
			return undefined;
		}
		return {
			// Recreate each secret resource so the owner stands up the matching
			// per-secret service (its name derives from `<store_id>:<secret_name>`,
			// so it matches what the client targets; the record keys are arbitrary).
			ownerOptions: {
				secretsStoreSecrets: Object.fromEntries(
					[...secrets.entries()].map(([resource, secret]) => [
						`owner:${resource}`,
						secret,
					])
				),
			},
		};
	},
};
