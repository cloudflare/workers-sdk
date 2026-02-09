import { createCommand } from "../core/create-command";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { resolveTunnelIds, withTunnelPermissionCheck } from "./client";

export const tunnelCleanupCommand = createCommand({
	metadata: {
		description: "Remove stale tunnel connections",
		status: "stable",
		owner: "Product: Tunnels",
	},
	args: {
		tunnels: {
			type: "string",
			demandOption: true,
			array: true,
			description: "One or more tunnel names or UUIDs to cleanup connections for",
		},
		connectorId: {
			type: "string",
			alias: ["connector-id", "c"],
			description: "Only cleanup connections for a specific connector ID",
		},
	},
	positionalArgs: ["tunnels"],
	async handler(args, { config, logger, sdk }) {
		const accountId = await requireAuth(config);
		const tunnelIds = await resolveTunnelIds(sdk, accountId, args.tunnels);

		logger.log(`Cleaning up connections for ${tunnelIds.length} tunnel(s)...`);

		let totalConnections = 0;
		for (const tunnelId of tunnelIds) {
			// Get current connections to show what we're cleaning up
			const connections = await withTunnelPermissionCheck(async () => {
				const results = [];
				for await (const client of sdk.zeroTrust.tunnels.cloudflared.connections.get(
					tunnelId,
					{ account_id: accountId }
				)) {
					if (client.conns) {
						for (const conn of client.conns) {
							if (args.connectorId && conn.client_id !== args.connectorId) {
								continue;
							}
							results.push(conn);
						}
					}
				}
				return results;
			});

			if (connections.length === 0) {
				continue;
			}

			totalConnections += connections.length;

			// Delete the connections
			await withTunnelPermissionCheck(async () => {
				await sdk.zeroTrust.tunnels.cloudflared.connections.delete(tunnelId, {
					account_id: accountId,
					client_id: args.connectorId,
				});
			});
		}

		if (totalConnections === 0) {
			logger.log(`\nNo connections found to cleanup.`);
			return;
		}

		metrics.sendMetricsEvent("tunnel cleanup", {
			sendMetrics: config.send_metrics,
		});

		logger.log(`\nCleaned up ${totalConnections} connection(s).`);
	},
});
