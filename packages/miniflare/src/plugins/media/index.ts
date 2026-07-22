import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin } from "../shared";

export const MEDIA_PLUGIN_NAME = "media";
const MEDIA_REMOTE_SERVICE_NAME = `${MEDIA_PLUGIN_NAME}:remote`;

export const MEDIA_PLUGIN: Plugin = {
	bindingTypeDescription: "Media",
	async getBindings(options) {
		return getEnvBindingsOfType(options.config, "media").map(
			([name, binding]) => ({
				name,
				service: {
					name: MEDIA_REMOTE_SERVICE_NAME,
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
			getEnvBindingsOfType(options.config, "media").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (getEnvBindingsOfType(options.config, "media").length === 0) {
			return [];
		}

		return [
			{
				name: MEDIA_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
