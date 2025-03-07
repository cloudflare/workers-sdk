import SCRIPT_SECRET_STORE_OBJECT from "worker:secret-store/secret-store";
import { z } from "zod";
import { ServiceDesignator, Worker_Binding } from "../../runtime";
import { KV_PLUGIN, KVOptionsSchema } from "../kv";
import { PersistenceSchema, Plugin, ProxyNodeBinding } from "../shared";

const SecretStoresSchema = z.record(
	z.object({
		store_id: z.string(),
		name: z.string(),
	})
);

export const SecretStoreOptionsSchema = z.object({
	secretStores: SecretStoresSchema.optional(),
});

export const SecretStoreSharedOptionsSchema = z.object({
	secretStorePersist: PersistenceSchema,
});

export const SECRET_STORE_PLUGIN_NAME = "secret-store";
const SERVICE_SECRET_STORE_PREFIX = `${SECRET_STORE_PLUGIN_NAME}`;
const SERVICE_SECRET_STORE_MODULE = `cloudflare-internal:${SERVICE_SECRET_STORE_PREFIX}:module`;

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
		if (!options.secretStores) {
			return [];
		}

		const kvBindings = await KV_PLUGIN.getBindings(
			getkvNamespacesOptions(options.secretStores),
			workerIndex
		);

		if (!kvBindings || !kvBindings.every(isKvBinding)) {
			throw new Error(
				"Expected KV plugin to return bindings with kvNamespace defined"
			);
		}

		const bindings = Object.entries(options.secretStores).map<Worker_Binding>(
			([name, config]) => {
				return {
					name,
					wrapped: {
						moduleName: SERVICE_SECRET_STORE_MODULE,
						innerBindings: [
							{
								name: "store",
								kvNamespace: kvBindings.find(
									// Look up the corresponding KV namespace for the store id
									(binding) => binding.name === config.store_id
								)?.kvNamespace,
							},
							{
								name: "name",
								json: JSON.stringify(config.name),
							},
						],
					},
				};
			}
		);
		return bindings;
	},
	getNodeBindings(options: z.infer<typeof SecretStoreOptionsSchema>) {
		if (!options.secretStores) {
			return {};
		}
		return Object.fromEntries(
			Object.keys(options.secretStores).map((name) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options, sharedOptions, ...restOptions }) {
		if (!options.secretStores) {
			return [];
		}

		const kvServices = await KV_PLUGIN.getServices({
			options: getkvNamespacesOptions(options.secretStores),
			sharedOptions: {
				kvPersist: sharedOptions.secretStorePersist,
			},
			...restOptions,
		});

		if (!Array.isArray(kvServices)) {
			throw new Error("Expected KV plugin to return an array of services");
		}

		return {
			services: kvServices,
			extensions: [
				{
					modules: [
						{
							name: SERVICE_SECRET_STORE_MODULE,
							esModule: SCRIPT_SECRET_STORE_OBJECT(),
							internal: true,
						},
					],
				},
			],
		};
	},
};
