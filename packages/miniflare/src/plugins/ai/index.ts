import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin } from "../shared";

export const AI_PLUGIN_NAME = "ai";
const AI_REMOTE_SERVICE_NAME = `${AI_PLUGIN_NAME}:remote`;

export const AI_PLUGIN: Plugin = {
	bindingTypeDescription: "AI",
	async getBindings(options) {
		return getEnvBindingsOfType(options.config, "ai").map(([name, binding]) => ({
			name,
			wrapped: {
				moduleName: "cloudflare-internal:ai-api",
				innerBindings: [
					{
						name: "fetcher",
						service: {
							name: AI_REMOTE_SERVICE_NAME,
							props: buildRemoteProxyProps(
								getRemoteProxyConnectionString(binding, options.dev),
								name
							),
						},
					},
				],
			},
		}));
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "ai").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (getEnvBindingsOfType(options.config, "ai").length === 0) {
			return [];
		}

		return [
			{
				name: AI_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
