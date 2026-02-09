import { createCommand } from "../core/create-command";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { getTunnel, resolveTunnelId } from "./client";

export const tunnelInfoCommand = createCommand({
	metadata: {
		description: "Display details about a Cloudflare Tunnel",
		status: "stable",
		owner: "Product: Tunnels",
	},
	args: {
		tunnel: {
			type: "string",
			demandOption: true,
			description: "The name or UUID of the tunnel",
		},
	},
	positionalArgs: ["tunnel"],
	async handler(args, { config, logger, sdk }) {
		const accountId = await requireAuth(config);
		const tunnelId = await resolveTunnelId(sdk, accountId, args.tunnel);

		logger.log(`Getting tunnel details for "${args.tunnel}"`);

		const tunnel = await getTunnel(sdk, accountId, tunnelId);

		metrics.sendMetricsEvent("info tunnel", {
			sendMetrics: config.send_metrics,
		});

		logger.log(`\nTunnel Information:`);
		logger.log(`  ID: ${tunnel.id}`);
		logger.log(`  Name: ${tunnel.name}`);
		logger.log(`  Status: ${tunnel.status || "unknown"}`);
		logger.log(`  Type: ${tunnel.tun_type || "cfd_tunnel"}`);
		if (tunnel.created_at) {
			logger.log(`  Created: ${new Date(tunnel.created_at).toLocaleString()}`);
		}
		if (tunnel.conns_active_at) {
			logger.log(
				`  Last Active: ${new Date(tunnel.conns_active_at).toLocaleString()}`
			);
		}
	},
});
