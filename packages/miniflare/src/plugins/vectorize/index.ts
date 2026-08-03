import { z } from "zod";
import { SERVICE_REMOTE_BINDINGS } from "../core";
import { buildRemoteProxyProps, ProxyNodeBinding } from "../shared";
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
									name: SERVICE_REMOTE_BINDINGS,
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
	async getServices() {
		return [];
	},
};
