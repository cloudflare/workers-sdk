import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { ParsedWorkerOptions, Plugin } from "../shared";

export const AI_SEARCH_PLUGIN_NAME = "ai-search";

// One shared remote-proxy service for all AI Search bindings (config via props).
const AI_SEARCH_REMOTE_SERVICE_NAME = `${AI_SEARCH_PLUGIN_NAME}:remote`;

function getAISearchBindings(config: ParsedWorkerOptions["config"]) {
	return [
		...getEnvBindingsOfType(config, "ai-search"),
		...getEnvBindingsOfType(config, "ai-search-namespace"),
	];
}

export const AI_SEARCH_PLUGIN: Plugin = {
	bindingTypeDescription: "AI Search",
	async getBindings(options) {
		return getAISearchBindings(options.config).map(([name, binding]) => ({
			name,
			service: {
				name: AI_SEARCH_REMOTE_SERVICE_NAME,
				props: buildRemoteProxyProps(
					getRemoteProxyConnectionString(binding, options.dev),
					name
				),
			},
		}));
	},
	getNodeBindings(options) {
		return Object.fromEntries(
			getAISearchBindings(options.config).map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (getAISearchBindings(options.config).length === 0) {
			return [];
		}

		return [
			{
				name: AI_SEARCH_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
