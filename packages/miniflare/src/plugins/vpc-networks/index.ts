import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin } from "../shared";

export const VPC_NETWORKS_PLUGIN_NAME = "vpc-networks";
const VPC_NETWORKS_REMOTE_SERVICE_NAME = `${VPC_NETWORKS_PLUGIN_NAME}:remote`;

export const VPC_NETWORKS_PLUGIN: Plugin = {
	bindingTypeDescription: "VPC network",
	async getBindings(options) {
		return getEnvBindingsOfType(options.config, "vpc-network").map(
			([name, binding]) => ({
				name,
				service: {
					name: VPC_NETWORKS_REMOTE_SERVICE_NAME,
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
			getEnvBindingsOfType(options.config, "vpc-network").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (getEnvBindingsOfType(options.config, "vpc-network").length === 0) {
			return [];
		}

		return [
			{
				name: VPC_NETWORKS_REMOTE_SERVICE_NAME,
				// VPC networks expose raw TCP via `binding.connect()`, tunnelled
				// through the proxy client's inbound `connect` handler. The shared
				// `vpc-networks:remote` service is dedicated to VPC networks, so
				// opting it into raw TCP leaves every other binding's service
				// untouched.
				worker: remoteProxyClientWorker(undefined, { rawTcp: true }),
			},
		];
	},
};
