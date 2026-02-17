import { createCommand } from "../core/create-command";
import { confirm } from "../dialogs";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { deleteTunnel, resolveTunnelId } from "./client";

export const tunnelDeleteCommand = createCommand({
	metadata: {
		description: "Delete a Cloudflare Tunnel",
		status: "experimental",
		owner: "Product: Tunnels",
	},
	args: {
		tunnel: {
			type: "string",
			demandOption: true,
			description: "The name or UUID of the tunnel",
		},
		force: {
			alias: "y",
			type: "boolean",
			description: "Skip confirmation",
		},
	},
	positionalArgs: ["tunnel"],
	async handler(args, { config, logger, sdk }) {
		const accountId = await requireAuth(config);

		if (!args.force) {
			const confirmed = await confirm(
				`Are you sure you want to delete tunnel "${args.tunnel}"? This action cannot be undone.`
			);
			if (!confirmed) {
				logger.log("Deletion cancelled.");
				return;
			}
		}

		logger.log(`Deleting tunnel "${args.tunnel}"`);
		const tunnelId = await resolveTunnelId(sdk, accountId, args.tunnel);
		await deleteTunnel(sdk, accountId, tunnelId);

		metrics.sendMetricsEvent("delete tunnel", {
			sendMetrics: config.send_metrics,
		});

		logger.log(`Tunnel deleted.`);
	},
});
