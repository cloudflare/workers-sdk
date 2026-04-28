import { createCommand } from "../core/create-command";
import { requireAuth } from "../user";
import { createTunnel } from "./client";

export const tunnelCreateCommand = createCommand({
	metadata: {
		description: "Create a new Cloudflare Tunnel",
		status: "experimental",
		owner: "Product: Tunnels",
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the tunnel",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config, sdk, logger }) {
		const accountId = await requireAuth(config);

		logger.log(`Creating tunnel "${args.name}"`);

		const tunnel = await createTunnel(sdk, accountId, args.name);

		logger.log(`Created tunnel.`);
		logger.log(`ID: ${tunnel.id}`);
		logger.log(`Name: ${tunnel.name}`);
		logger.log(
			`\nTo run this tunnel, configure its ingress rules in the Cloudflare dashboard, then run:`
		);
		logger.log(`   wrangler tunnel run ${tunnel.id}`);
	},
});
