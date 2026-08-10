import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin } from "../shared";

export const MTLS_PLUGIN_NAME = "mtls";
const MTLS_REMOTE_SERVICE_NAME = `${MTLS_PLUGIN_NAME}:remote`;

export const MTLS_PLUGIN: Plugin = {
	bindingTypeDescription: "mTLS certificate",
	async getBindings(options) {
		return getEnvBindingsOfType(options.config, "mtls-certificate").map(
			([name, binding]) => ({
				name,
				service: {
					name: MTLS_REMOTE_SERVICE_NAME,
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
			getEnvBindingsOfType(options.config, "mtls-certificate").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (getEnvBindingsOfType(options.config, "mtls-certificate").length === 0) {
			return [];
		}

		return [
			{
				name: MTLS_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
