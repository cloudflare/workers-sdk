import { UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../core/create-command";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { resolveTunnelId, updateTunnel } from "./client";

export const tunnelUpdateCommand = createCommand({
	metadata: {
		description: "Update a Cloudflare Tunnel",
		status: "stable",
		owner: "Product: Tunnels",
	},
	args: {
		tunnel: {
			type: "string",
			demandOption: true,
			description: "The name or UUID of the tunnel",
		},
		name: {
			type: "string",
			description: "The new name for the tunnel",
		},
	},
	positionalArgs: ["tunnel"],
	async handler(args, { config, logger, sdk }) {
		const accountId = await requireAuth(config);

		if (!args.name) {
			throw new UserError(
				"Please provide a new name for the tunnel using --name"
			);
		}

		const tunnelId = await resolveTunnelId(sdk, accountId, args.tunnel);
		logger.log(`Updating tunnel "${args.tunnel}"`);

		const tunnel = await updateTunnel(sdk, accountId, tunnelId, args.name);

		metrics.sendMetricsEvent("update tunnel", {
			sendMetrics: config.send_metrics,
		});

		logger.log(`Updated tunnel.`);
		logger.log(`ID: ${tunnel.id}`);
		logger.log(`Name: ${tunnel.name}`);
	},
});
