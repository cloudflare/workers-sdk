import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { updateNetwork } from "./network-client";
import type { ConnectivityNetworkUpdateRequest } from "./index";

export const vpcNetworkUpdateCommand = createCommand({
	metadata: {
		description: "Update a VPC network",
		status: "open beta",
		owner: "Product: WVPC",
	},
	args: {
		"network-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the VPC network to update",
		},
		name: {
			type: "string",
			description: "The new name for the VPC network",
			group: "Optional Configuration",
		},
		"resolver-ips": {
			type: "string",
			description: "Comma-separated list of DNS resolver IPs",
			group: "Optional Configuration",
		},
	},
	positionalArgs: ["network-id"],
	async handler(args, { config }) {
		logger.log(`🚧 Updating VPC network '${args.networkId}'`);

		const body: ConnectivityNetworkUpdateRequest = {};
		if (args.name) {
			body.name = args.name;
		}
		if (args.resolverIps) {
			body.resolver_ips = args.resolverIps.split(",").map((ip) => ip.trim());
		}

		const network = await updateNetwork(config, args.networkId, body);

		logger.log(`✅ Updated VPC network: ${network.network_id}`);
		logger.log(`   Name: ${network.name ?? "(auto-provisioned)"}`);
		logger.log(`   Tunnel ID: ${network.tunnel_id}`);
		if (network.resolver_ips) {
			logger.log(`   Resolver IPs: ${network.resolver_ips.join(", ")}`);
		}
	},
});
