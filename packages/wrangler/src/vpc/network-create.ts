import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { createNetwork } from "./network-client";
import { networkOptions } from "./index";

export const vpcNetworkCreateCommand = createCommand({
	metadata: {
		description: "Create a new VPC network",
		status: "open beta",
		owner: "Product: WVPC",
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			group: "Required Configuration",
			description: "The name of the VPC network",
		},
		...networkOptions,
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		logger.log(`🚧 Creating VPC network '${args.name}'`);

		let resolverIpsList: string[] | undefined = undefined;
		if (args.resolverIps) {
			resolverIpsList = args.resolverIps.split(",").map((ip) => ip.trim());
		}

		const network = await createNetwork(config, {
			name: args.name,
			tunnel_id: args.tunnelId,
			...(resolverIpsList ? { resolver_ips: resolverIpsList } : {}),
		});

		logger.log(`✅ Created VPC network: ${network.network_id}`);
		logger.log(`   Name: ${network.name}`);
		logger.log(`   Tunnel ID: ${network.tunnel_id}`);
		if (network.resolver_ips) {
			logger.log(`   Resolver IPs: ${network.resolver_ips.join(", ")}`);
		}
	},
});
