import K2_REMOTE_CLIENT from "worker:k2/binding";
import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin } from "../shared";

export const K2_PLUGIN_NAME = "k2";
const K2_REMOTE_SERVICE_NAME = `${K2_PLUGIN_NAME}:remote`;

// Use the same RPC transport as Pipelines. K2 has no local storage emulator.
export const K2_PLUGIN: Plugin = {
	bindingTypeDescription: "K2 Stream",
	getBindings(options) {
		return getEnvBindingsOfType(options.config, "k2").map(
			([name, binding]) => ({
				name,
				service: {
					name: K2_REMOTE_SERVICE_NAME,
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
			getEnvBindingsOfType(options.config, "k2").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (getEnvBindingsOfType(options.config, "k2").length === 0) {
			return [];
		}
		return [
			{
				name: K2_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(K2_REMOTE_CLIENT),
			},
		];
	},
};
