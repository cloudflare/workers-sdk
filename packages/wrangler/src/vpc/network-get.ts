import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { getNetwork } from "./network-client";

export const vpcNetworkGetCommand = createCommand({
	metadata: {
		description: "Get a VPC network",
		status: "open beta",
		owner: "Product: WVPC",
	},
	args: {
		"network-id": {
			type: "string",
			demandOption: true,
			description: "The ID of the VPC network",
		},
	},
	positionalArgs: ["network-id"],
	async handler(args, { config }) {
		logger.log(`🔍 Getting VPC network '${args.networkId}'`);

		const network = await getNetwork(config, args.networkId);

		logger.log(`✅ Retrieved VPC network: ${network.network_id}`);
		logger.log(`   Name: ${network.name ?? "(auto-provisioned)"}`);
		logger.log(`   Tunnel ID: ${network.tunnel_id}`);
		if (network.resolver_ips) {
			logger.log(`   Resolver IPs: ${network.resolver_ips.join(", ")}`);
		}
		logger.log(
			`   Auto-provisioned: ${network.auto_provisioned ? "yes" : "no"}`
		);
		logger.log(`   Created: ${new Date(network.created_at).toLocaleString()}`);
		logger.log(`   Modified: ${new Date(network.updated_at).toLocaleString()}`);
	},
});
