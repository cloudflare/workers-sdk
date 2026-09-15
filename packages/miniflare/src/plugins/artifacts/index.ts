import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin } from "../shared";

export const ARTIFACTS_PLUGIN_NAME = "artifacts";
// One shared remote-proxy service for every artifacts binding; per-binding
// config travels via props.
const ARTIFACTS_REMOTE_SERVICE_NAME = `${ARTIFACTS_PLUGIN_NAME}:remote`;

export const ARTIFACTS_PLUGIN: Plugin = {
	bindingTypeDescription: "Artifacts",
	async getBindings(options) {
		return getEnvBindingsOfType(options.config, "artifacts").map(
			([name, binding]) => ({
				name,
				service: {
					name: ARTIFACTS_REMOTE_SERVICE_NAME,
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
			getEnvBindingsOfType(options.config, "artifacts").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (getEnvBindingsOfType(options.config, "artifacts").length === 0) {
			return [];
		}

		return [
			{
				name: ARTIFACTS_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
