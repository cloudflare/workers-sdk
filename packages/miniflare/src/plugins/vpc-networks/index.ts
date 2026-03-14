import { z } from "zod";
import {
	getUserBindingServiceName,
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
} from "../shared";

const VpcNetworksSchema = z.object({
	target_id: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const VpcNetworksOptionsSchema = z.object({
	vpcNetworks: z.record(VpcNetworksSchema).optional(),
});

export const VPC_NETWORKS_PLUGIN_NAME = "vpc-networks";

export const VPC_NETWORKS_PLUGIN: Plugin<typeof VpcNetworksOptionsSchema> = {
	options: VpcNetworksOptionsSchema,
	async getBindings(options) {
		if (!options.vpcNetworks) {
			return [];
		}

		return Object.entries(options.vpcNetworks).map(
			([name, { target_id, remoteProxyConnectionString }]) => {
				return {
					name,

					service: {
						name: getUserBindingServiceName(
							VPC_NETWORKS_PLUGIN_NAME,
							target_id,
							remoteProxyConnectionString
						),
					},
				};
			}
		);
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
		if (!options.vpcNetworks) {
			return [];
		}

		return Object.entries(options.vpcNetworks).map(
			([name, { target_id, remoteProxyConnectionString }]) => {
				return {
					name: getUserBindingServiceName(
						VPC_NETWORKS_PLUGIN_NAME,
						target_id,
						remoteProxyConnectionString
					),
					worker: remoteProxyClientWorker(remoteProxyConnectionString, name),
				};
			}
		);
	},
};
