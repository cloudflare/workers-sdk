import {
	buildRemoteProxyProps,
	getEnvBindingsOfType,
	getRemoteProxyConnectionString,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin } from "../shared";

export const VPC_SERVICES_PLUGIN_NAME = "vpc-services";
const VPC_SERVICES_REMOTE_SERVICE_NAME = `${VPC_SERVICES_PLUGIN_NAME}:remote`;

export const VPC_SERVICES_PLUGIN: Plugin = {
	bindingTypeDescription: "VPC service",
	async getBindings(options) {
		return getEnvBindingsOfType(options.config, "vpc-service").map(
			([name, binding]) => ({
				name,
				service: {
					name: VPC_SERVICES_REMOTE_SERVICE_NAME,
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
			getEnvBindingsOfType(options.config, "vpc-service").map(([name]) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (getEnvBindingsOfType(options.config, "vpc-service").length === 0) {
			return [];
		}

		return [
			{
				name: VPC_SERVICES_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
