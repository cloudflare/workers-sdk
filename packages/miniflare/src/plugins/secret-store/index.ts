import SCRIPT_SECRETS_STORE_SECRET from "worker:secrets-store/secret";
import { z } from "zod";
import { ServiceDesignator, Worker_Binding } from "../../runtime";
import { KV_PLUGIN, KVOptionsSchema } from "../kv";
import { PersistenceSchema, Plugin, ProxyNodeBinding } from "../shared";

const SecretStoresSchema = z.record(
	z.object({
		store_id: z.string(),
		secret_name: z.string(),
	})
);

export const SecretStoreOptionsSchema = z.object({
	secretsStoreSecrets: SecretStoresSchema.optional(),
});

export const SecretStoreSharedOptionsSchema = z.object({
	secretsStorePersist: PersistenceSchema,
});

export const SECRET_STORE_PLUGIN_NAME = "secrets-store";

function getkvNamespacesOptions(
	secretStores: z.input<typeof SecretStoresSchema>
): z.input<typeof KVOptionsSchema> {
	// Get unique store ids
	const storeIds = new Set(
		Object.values(secretStores).map((store) => store.store_id)
	);
	// Setup a KV Namespace per store id with store id as the binding name
	const storeIdKvNamespaceEntries = Array.from(storeIds).map((storeId) => [
		storeId,
		`${SECRET_STORE_PLUGIN_NAME}:${storeId}`,
	]);

	return {
		kvNamespaces: Object.fromEntries(storeIdKvNamespaceEntries),
	};
}

function isKvBinding(
	binding: Worker_Binding
): binding is Worker_Binding & { kvNamespace: ServiceDesignator } {
	return "kvNamespace" in binding;
}

export const SECRET_STORE_PLUGIN: Plugin<
	typeof SecretStoreOptionsSchema,
	typeof SecretStoreSharedOptionsSchema
> = {
	options: SecretStoreOptionsSchema,
	sharedOptions: SecretStoreSharedOptionsSchema,
	async getBindings(options, workerIndex) {
		if (!options.secretsStoreSecrets) {
			return [];
		}

		const bindings = Object.entries(
			options.secretsStoreSecrets
		).map<Worker_Binding>(([name, config]) => {
			return {
				name,
				service: {
					name: `${SECRET_STORE_PLUGIN_NAME}:${config.store_id}:${config.secret_name}`,
					entrypoint: "SecretsStoreSecret",
				},
			};
		});
		return bindings;
	},
	getNodeBindings(options: z.infer<typeof SecretStoreOptionsSchema>) {
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
	async getServices({ options, sharedOptions, ...restOptions }) {
		if (!options.secretsStoreSecrets) {
			return [];
		}

		const kvServices = await KV_PLUGIN.getServices({
			options: getkvNamespacesOptions(options.secretsStoreSecrets),
			sharedOptions: {
				kvPersist: sharedOptions.secretsStorePersist,
			},
			...restOptions,
		});

		const kvBindings = await KV_PLUGIN.getBindings(
			getkvNamespacesOptions(options.secretsStoreSecrets),
			restOptions.workerIndex
		);

		if (!kvBindings || !kvBindings.every(isKvBinding)) {
			throw new Error(
				"Expected KV plugin to return bindings with kvNamespace defined"
			);
		}

		if (!Array.isArray(kvServices)) {
			throw new Error("Expected KV plugin to return an array of services");
		}

		return [
			...kvServices,
			...Object.entries(options.secretsStoreSecrets).map<Worker_Binding>(
				([name, config]) => {
					return {
						name: `${SECRET_STORE_PLUGIN_NAME}:${config.store_id}:${config.secret_name}`,
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
									kvNamespace: kvBindings.find(
										// Look up the corresponding KV namespace for the store id
										(binding) => binding.name === config.store_id
									)?.kvNamespace,
								},
								{
									name: "secret_name",
									json: JSON.stringify(config.secret_name),
								},
							],
						},
					};
				}
			),
		];
	},
};
