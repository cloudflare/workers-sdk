import assert from "node:assert";
import { z } from "zod";
import {
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
} from "../shared";

const VectorizeSchema = z.object({
	index_name: z.string(),
	remoteProxyConnectionString: z.custom<RemoteProxyConnectionString>(),
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
			([name, { index_name, remoteProxyConnectionString }]) => {
				assert(
					remoteProxyConnectionString,
					"Vectorize only supports running remotely"
				);

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
			([name, { remoteProxyConnectionString }]) => {
				assert(
					remoteProxyConnectionString,
					"Vectorize only supports running remotely"
				);

				return {
					name: `${VECTORIZE_PLUGIN_NAME}:${name}`,
					worker: remoteProxyClientWorker(remoteProxyConnectionString, name),
				};
			}
		);
	},
};
