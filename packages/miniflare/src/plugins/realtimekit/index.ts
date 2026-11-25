import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin } from "../shared";

export const REALTIMEKIT_PLUGIN_NAME = "realtimekit";
const REALTIMEKIT_REMOTE_SERVICE_NAME = `${REALTIMEKIT_PLUGIN_NAME}:remote`;

export const REALTIMEKIT_PLUGIN: Plugin = {
	bindingTypeDescription: "RealtimeKit",
	getBindings(options) {
		return getEnvBindingsOfType(options.config, "realtime-kit").map(
			([name, binding]) => ({
				name,
				service: {
					name: REALTIMEKIT_REMOTE_SERVICE_NAME,
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
			getEnvBindingsOfType(options.config, "realtime-kit").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (getEnvBindingsOfType(options.config, "realtime-kit").length === 0) {
			return [];
		}

		return [
			{
				name: REALTIMEKIT_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
