import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin } from "../shared";

export const VECTORIZE_PLUGIN_NAME = "vectorize";
const VECTORIZE_REMOTE_SERVICE_NAME = `${VECTORIZE_PLUGIN_NAME}:remote`;

export const VECTORIZE_PLUGIN: Plugin = {
	bindingTypeDescription: "Vectorize index",
	async getBindings(options) {
		return getEnvBindingsOfType(options.config, "vectorize").map(
			([name, binding]) => {
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
										getRemoteProxyConnectionString(binding, options.dev),
										name
									),
								},
							},
							{
								name: "indexId",
								text: binding.name,
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
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "vectorize").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (getEnvBindingsOfType(options.config, "vectorize").length === 0) {
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
