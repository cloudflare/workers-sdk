import { createCommand } from "../core/create-command";
import * as metrics from "../metrics";
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

		metrics.sendMetricsEvent("create tunnel", {
			sendMetrics: config.send_metrics,
		});

		logger.log(`Created tunnel.`);
		logger.log(`ID: ${tunnel.id}`);
		logger.log(`Name: ${tunnel.name}`);
		logger.log(`\nTo run this tunnel:`);
		logger.log(
			`   wrangler tunnel run ${tunnel.id} --url http://localhost:3000`
		);
	},
});
