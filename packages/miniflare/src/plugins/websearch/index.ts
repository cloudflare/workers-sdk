import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin } from "../shared";

export const WEBSEARCH_PLUGIN_NAME = "websearch";

const WEBSEARCH_SCOPE = "websearch";
const WEBSEARCH_REMOTE_SERVICE_NAME = `${WEBSEARCH_SCOPE}:remote`;

export const WEBSEARCH_PLUGIN: Plugin = {
	bindingTypeDescription: "Web Search",
	async getBindings(options) {
		return getEnvBindingsOfType(options.config, "web-search").map(
			([name, binding]) => ({
				name,
				service: {
					name: WEBSEARCH_REMOTE_SERVICE_NAME,
					props: buildRemoteProxyProps(
						getRemoteProxyConnectionString(binding, options.dev),
						name
					),
				},
			})
		);
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getEnvBindingsOfType(options.config, "web-search").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (getEnvBindingsOfType(options.config, "web-search").length === 0) {
			return [];
		}

		return [
			{
				name: WEBSEARCH_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
