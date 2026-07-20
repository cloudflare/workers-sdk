import { z } from "zod";
import {
	buildRemoteProxyProps,
	ProxyNodeBinding,
	remoteProxyClientWorker,
} from "../shared";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

const VpcNetworksSchema = z.union([
	z.object({
		tunnel_id: z.string(),
		remoteProxyConnectionString: z
			.custom<RemoteProxyConnectionString>()
			.optional(),
	}),
	z.object({
		network_id: z.string(),
		remoteProxyConnectionString: z
			.custom<RemoteProxyConnectionString>()
			.optional(),
	}),
]);

export const VpcNetworksOptionsSchema = z.object({
	vpcNetworks: z.record(VpcNetworksSchema).optional(),
});

export const VPC_NETWORKS_PLUGIN_NAME = "vpc-networks";
const VPC_NETWORKS_REMOTE_SERVICE_NAME = `${VPC_NETWORKS_PLUGIN_NAME}:remote`;

export const VPC_NETWORKS_PLUGIN: Plugin<typeof VpcNetworksOptionsSchema> = {
	options: VpcNetworksOptionsSchema,
	bindingTypeDescription: "VPC network",
	async getBindings(options) {
		if (!options.vpcNetworks) {
			return [];
		}

		return Object.entries(options.vpcNetworks).map(([name, binding]) => {
			return {
				name,

				service: {
					name: VPC_NETWORKS_REMOTE_SERVICE_NAME,
					props: buildRemoteProxyProps(
						binding.remoteProxyConnectionString,
						name
					),
				},
			};
		});
	},
	getNodeBindings(options: z.infer<typeof VpcNetworksOptionsSchema>) {
		if (!options.vpcNetworks) {
			return {};
		}
		return Object.fromEntries(
			Object.keys(options.vpcNetworks).map((name) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (!options.vpcNetworks || Object.keys(options.vpcNetworks).length === 0) {
			return [];
		}

		return [
			{
				name: VPC_NETWORKS_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
			},
		];
	},
};
