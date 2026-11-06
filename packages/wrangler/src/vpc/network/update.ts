import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { updateNetwork } from "./client";
import { validateResolverIps } from "./validation";

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
			description: "New name for the VPC network",
		},
		"resolver-ips": {
			type: "string",
			description:
				"Comma-separated list of custom DNS resolver IPs. Pass an empty string to reset to default.",
		},
	},
	positionalArgs: ["network-id"],
	async handler(args, { config }) {
		logger.log(`🚧 Updating VPC network '${args.networkId}'`);

		const resolverIps = args.resolverIps
			? validateResolverIps(args.resolverIps)
			: undefined;

		const network = await updateNetwork(config, args.networkId, {
			...(args.name !== undefined && { name: args.name }),
			...(resolverIps !== undefined && { resolver_ips: resolverIps }),
		});

		logger.log(`✅ Updated VPC network: ${network.network_id}`);
		logger.log(`   Name: ${network.name}`);
		logger.log(`   Tunnel ID: ${network.tunnel_id}`);
		if (network.resolver_ips && network.resolver_ips.length > 0) {
			logger.log(`   Resolver IPs: ${network.resolver_ips.join(", ")}`);
		} else {
			logger.log(`   Resolver IPs: Default`);
		}
	},
});
