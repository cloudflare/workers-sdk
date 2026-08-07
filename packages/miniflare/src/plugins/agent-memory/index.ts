import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin } from "../shared";

export const AGENT_MEMORY_PLUGIN_NAME = "agent-memory";

const AGENT_MEMORY_SCOPE = "agent-memory";
const AGENT_MEMORY_REMOTE_SERVICE_NAME = `${AGENT_MEMORY_SCOPE}:remote`;

export const AGENT_MEMORY_PLUGIN: Plugin = {
	bindingTypeDescription: "Agent Memory",
	async getBindings(options) {
		return getEnvBindingsOfType(options.config, "agent-memory").map(
			([name, binding]) => ({
				name,
				service: {
					name: AGENT_MEMORY_REMOTE_SERVICE_NAME,
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
			getEnvBindingsOfType(options.config, "agent-memory").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (getEnvBindingsOfType(options.config, "agent-memory").length === 0) {
			return [];
		}

		return [
			{
				name: AGENT_MEMORY_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
