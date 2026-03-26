import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { createNetwork } from "./client";
import { validateResolverIps } from "./validation";

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
			description: "The name of the VPC network",
		},
		"tunnel-id": {
			type: "string",
			demandOption: true,
			description:
				"UUID of the Cloudflare tunnel to associate with this network",
		},
		"resolver-ips": {
			type: "string",
			description:
				"Comma-separated list of custom DNS resolver IPs (optional). When omitted, the tunnel's default DNS is used.",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		logger.log(`🚧 Creating VPC network '${args.name}'`);

		const resolverIps = args.resolverIps
			? validateResolverIps(args.resolverIps)
			: undefined;

		const network = await createNetwork(config, {
			name: args.name,
			tunnel_id: args.tunnelId,
			...(resolverIps && { resolver_ips: resolverIps }),
		});

		logger.log(`✅ Created VPC network: ${network.network_id}`);
		logger.log(`   Name: ${network.name}`);
		logger.log(`   Tunnel ID: ${network.tunnel_id}`);
		if (network.resolver_ips && network.resolver_ips.length > 0) {
			logger.log(`   Resolver IPs: ${network.resolver_ips.join(", ")}`);
		} else {
			logger.log(`   Resolver IPs: Default`);
		}
	},
});
