import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Worker_Binding } from "../../runtime";
import type { Plugin } from "../shared";

export const FLAGSHIP_PLUGIN_NAME = "flagship";
const FLAGSHIP_REMOTE_SERVICE_NAME = `${FLAGSHIP_PLUGIN_NAME}:remote`;

export const FLAGSHIP_PLUGIN: Plugin = {
	bindingTypeDescription: "Flagship",
	async getBindings(options) {
		return getEnvBindingsOfType(options.config, "flagship").map<Worker_Binding>(
			([name, binding]) => ({
				name,
				service: {
					name: FLAGSHIP_REMOTE_SERVICE_NAME,
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
			getEnvBindingsOfType(options.config, "flagship").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (getEnvBindingsOfType(options.config, "flagship").length === 0) {
			return [];
		}

		return [
			{
				name: FLAGSHIP_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
