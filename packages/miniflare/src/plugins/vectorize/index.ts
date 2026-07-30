import { z } from "zod";
import {
	buildRemoteProxyProps,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const VectorizeSchema = z.object({
	index_name: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const VectorizeOptionsSchema = z.object({
	vectorize: z.record(z.string(), VectorizeSchema).optional(),
});

export const VECTORIZE_PLUGIN_NAME = "vectorize";
const VECTORIZE_REMOTE_SERVICE_NAME = `${VECTORIZE_PLUGIN_NAME}:remote`;

export const VECTORIZE_PLUGIN: Plugin<typeof VectorizeOptionsSchema> = {
	options: VectorizeOptionsSchema,
	bindingTypeDescription: "Vectorize index",
	async getBindings(options) {
		if (!options.vectorize) {
			return [];
		}

		return Object.entries(options.vectorize).map(
			([name, { index_name, remoteProxyConnectionString }]) => {
				return {
					name,
					wrapped: {
						moduleName: "cloudflare-internal:vectorize-api",
						innerBindings: [
							{
								name: "fetcher",
								service: {
									name: VECTORIZE_REMOTE_SERVICE_NAME,
									props: buildRemoteProxyProps(
										remoteProxyConnectionString,
										name
									),
								},
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
		if (!options.vectorize || Object.keys(options.vectorize).length === 0) {
			return [];
		}

		return [
			{
				name: VECTORIZE_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
