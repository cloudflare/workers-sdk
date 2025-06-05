import assert from "node:assert";
import { z } from "zod";
import {
	hybridClientWorker,
	HybridConnectionString,
	Plugin,
	ProxyNodeBinding,
} from "../shared";

const VectorizeSchema = z.object({
	index_name: z.string(),
	hybridConnectionString: z.custom<HybridConnectionString>(),
});

export const VectorizeOptionsSchema = z.object({
	vectorize: z.record(VectorizeSchema).optional(),
});

export const VECTORIZE_PLUGIN_NAME = "vectorize";

export const VECTORIZE_PLUGIN: Plugin<typeof VectorizeOptionsSchema> = {
	options: VectorizeOptionsSchema,
	async getBindings(options) {
		if (!options.vectorize) {
			return [];
		}

		return Object.entries(options.vectorize).map(
			([name, { index_name, hybridConnectionString }]) => {
				assert(hybridConnectionString, "Vectorize only supports Mixed Mode");

				return {
					name,
					wrapped: {
						moduleName: "cloudflare-internal:vectorize-api",
						innerBindings: [
							{
								name: "fetcher",
								service: { name: `${VECTORIZE_PLUGIN_NAME}:${name}` },
							},
							{
								name: "indexId",
								text: index_name,
							},
							{
								name: "indexVersion",
								text: "v2",
							},
							{
								name: "useNdJson",
								json: true,
							},
						],
					},
				};
			}
		);
	},
	getNodeBindings(options: z.infer<typeof VectorizeOptionsSchema>) {
		if (!options.vectorize) {
			return {};
		}
		return Object.fromEntries(
			Object.keys(options.vectorize).map((name) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (!options.vectorize) {
			return [];
		}

		return Object.entries(options.vectorize).map(
			([name, { hybridConnectionString }]) => {
				assert(hybridConnectionString, "Vectorize only supports Mixed Mode");

				return {
					name: `${VECTORIZE_PLUGIN_NAME}:${name}`,
					worker: hybridClientWorker(hybridConnectionString, name),
				};
			}
		);
	},
};
