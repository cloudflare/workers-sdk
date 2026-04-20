import { z } from "zod";
import {
	getUserBindingServiceName,
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

export const VPC_NETWORKS_PLUGIN: Plugin<typeof VpcNetworksOptionsSchema> = {
	options: VpcNetworksOptionsSchema,
	async getBindings(options) {
		if (!options.vpcNetworks) {
			return [];
		}

		return Object.entries(options.vpcNetworks).map(([name, binding]) => {
			const identifier =
				"tunnel_id" in binding ? binding.tunnel_id : binding.network_id;
			return {
				name,

				service: {
					name: getUserBindingServiceName(
						VPC_NETWORKS_PLUGIN_NAME,
						identifier,
						binding.remoteProxyConnectionString
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
		if (!options.vpcNetworks) {
			return [];
		}

		return Object.entries(options.vpcNetworks).map(([name, binding]) => {
			const identifier =
				"tunnel_id" in binding ? binding.tunnel_id : binding.network_id;
			return {
				name: getUserBindingServiceName(
					VPC_NETWORKS_PLUGIN_NAME,
					identifier,
					binding.remoteProxyConnectionString
				),
				worker: remoteProxyClientWorker(
					binding.remoteProxyConnectionString,
					name
				),
			};
		});
	},
};
