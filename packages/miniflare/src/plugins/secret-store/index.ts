import SCRIPT_SECRET_STORE_OBJECT from "worker:secret-store/secret-store";
import { z } from "zod";
import { Worker_Binding } from "../../runtime";
import { Plugin, ProxyNodeBinding } from "../shared";

export const SecretStoreOptionsSchema = z.object({
	secretStores: z
		.record(
			z.object({
				storeId: z.string(),
				name: z.string(),
			})
		)
		.optional(),
});

export const SECRET_STORE_PLUGIN_NAME = "secret-store";
const SERVICE_SECRET_STORE_PREFIX = `${SECRET_STORE_PLUGIN_NAME}`;
const SERVICE_SECRET_STORE_MODULE = `cloudflare-internal:${SERVICE_SECRET_STORE_PREFIX}:module`;

export const SECRET_STORE_PLUGIN: Plugin<typeof SecretStoreOptionsSchema> = {
	options: SecretStoreOptionsSchema,
	getBindings(options: z.infer<typeof SecretStoreOptionsSchema>) {
		if (!options.secretStores) {
			return [];
		}

		const bindings = Object.entries(options.secretStores).map<Worker_Binding>(
			([name, config]) => ({
				name,
				wrapped: {
					moduleName: SERVICE_SECRET_STORE_MODULE,
					innerBindings: Object.entries(config).map(([name, value]) => ({
						name,
						json: JSON.stringify(value),
					})),
				},
			})
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
	async getServices({ options }) {
		if (!options.secretStores) {
			return [];
		}

		return {
			services: [],
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
