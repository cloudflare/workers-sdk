import { UserError } from "@cloudflare/workers-utils";
import { createCommand, createNamespace } from "../../core/create-command";
import * as metrics from "../../metrics";
import { requireAuth } from "../../user";
import { resolveTunnelId, withTunnelPermissionCheck } from "../client";

export const tunnelRouteIpNamespace = createNamespace({
	metadata: {
		description:
			"Configure private IP network routes for Cloudflare WARP traffic",
		status: "stable",
		owner: "Product: Tunnels",
	},
});

/**
 * Add a private network route
 */
export const tunnelRouteIpAddCommand = createCommand({
	metadata: {
		description: "Add a private network route to a tunnel",
		status: "stable",
		owner: "Product: Tunnels",
	},
	args: {
		network: {
			type: "string",
			demandOption: true,
			description: "The private IP CIDR range (e.g., 10.0.0.0/8)",
		},
		tunnel: {
			type: "string",
			demandOption: true,
			description: "The tunnel name or UUID",
		},
		comment: {
			type: "string",
			description: "Optional description for this route",
		},
		virtualNetwork: {
			type: "string",
			alias: ["vnet", "vn"],
			description: "Virtual network ID (for overlapping IP ranges)",
		},
	},
	positionalArgs: ["network", "tunnel", "comment"],
	async handler(args, { config, logger, sdk }) {
		const accountId = await requireAuth(config);
		const tunnelId = await resolveTunnelId(sdk, accountId, args.tunnel);

		logger.log(
			`Creating IP route for "${args.network}" to tunnel "${args.tunnel}"`
		);

		// Create the route
		await withTunnelPermissionCheck(async () => {
			await sdk.zeroTrust.networks.routes.create({
				account_id: accountId,
				network: args.network,
				tunnel_id: tunnelId,
				comment: args.comment,
				virtual_network_id: args.virtualNetwork,
			});
		});

		metrics.sendMetricsEvent("create tunnel ip route", {
			sendMetrics: config.send_metrics,
		});

		logger.log(`\nIP route created.`);
		logger.log(`   ${args.network} -> ${tunnelId}`);
		logger.log(
			`\n   WARP-connected users can now reach ${args.network} through this tunnel.`
		);
	},
});

/**
 * List private network routes
 */
export const tunnelRouteIpListCommand = createCommand({
	metadata: {
		description: "Show private network routes",
		status: "stable",
		owner: "Product: Tunnels",
	},
	args: {
		tunnel: {
			type: "string",
			description: "Filter by tunnel name or UUID (optional)",
		},
		virtualNetwork: {
			type: "string",
			alias: ["vnet", "vn"],
			description: "Filter by virtual network ID (optional)",
		},
	},
	async handler(args, { config, logger, sdk }) {
		const accountId = await requireAuth(config);

		logger.log(`Listing IP routes...`);

		// List routes
		const tunnelId = args.tunnel
			? await resolveTunnelId(sdk, accountId, args.tunnel)
			: undefined;

		const routes = await withTunnelPermissionCheck(async () => {
			const results = [];
			for await (const route of sdk.zeroTrust.networks.routes.list({
				account_id: accountId,
				tunnel_id: tunnelId,
				virtual_network_id: args.virtualNetwork,
			})) {
				results.push(route);
			}
			return results;
		});

		metrics.sendMetricsEvent("list tunnel ip routes", {
			sendMetrics: config.send_metrics,
		});

		if (routes.length === 0) {
			logger.log(`\nNo IP routes found.`);
			return;
		}

		logger.table(
			routes.map((r) => ({
				id: r.id || "",
				network: r.network || "",
				tunnel_id: r.tunnel_id || "",
				tunnel_name: r.tunnel_name || "",
				virtual_network_id: r.virtual_network_id || "-",
				comment: r.comment || "-",
			}))
		);
	},
});

/**
 * Delete a private network route
 */
export const tunnelRouteIpDeleteCommand = createCommand({
	metadata: {
		description: "Delete a private network route",
		status: "stable",
		owner: "Product: Tunnels",
	},
	args: {
		route: {
			type: "string",
			demandOption: true,
			description: "The route ID or CIDR to delete",
		},
		virtualNetwork: {
			type: "string",
			alias: ["vnet", "vn"],
			description: "Virtual network ID (for overlapping IP ranges)",
		},
	},
	positionalArgs: ["route"],
	async handler(args, { config, logger, sdk }) {
		const accountId = await requireAuth(config);

		logger.log(`Deleting IP route "${args.route}"`);

		let routeId = args.route;
		if (args.route.includes("/")) {
			// Treat as CIDR and resolve to a route ID.
			routeId = await withTunnelPermissionCheck(async () => {
				for await (const route of sdk.zeroTrust.networks.routes.list({
					account_id: accountId,
					virtual_network_id: args.virtualNetwork,
				})) {
					if (route.network === args.route) {
						if (!route.id) {
							break;
						}
						return route.id;
					}
				}
				throw new UserError(
					`Could not find an IP route for network "${args.route}".`
				);
			});
		}

		await withTunnelPermissionCheck(async () => {
			await sdk.zeroTrust.networks.routes.delete(routeId, {
				account_id: accountId,
			});
		});

		metrics.sendMetricsEvent("delete tunnel ip route", {
			sendMetrics: config.send_metrics,
		});

		logger.log(`\nIP route deleted.`);
	},
});

/**
 * Get info about which route matches an IP
 */
export const tunnelRouteIpGetCommand = createCommand({
	metadata: {
		description: "Check which route matches a given IP address",
		status: "stable",
		owner: "Product: Tunnels",
	},
	args: {
		ip: {
			type: "string",
			demandOption: true,
			description: "The IP address to check",
		},
		virtualNetwork: {
			type: "string",
			alias: ["vnet", "vn"],
			description: "Virtual network ID to check within",
		},
	},
	positionalArgs: ["ip"],
	async handler(args, { config, logger, sdk }) {
		const accountId = await requireAuth(config);

		logger.log(`Checking route for IP "${args.ip}"...`);

		const route = await withTunnelPermissionCheck(async () => {
			return await sdk.zeroTrust.networks.routes.ips.get(args.ip, {
				account_id: accountId,
				virtual_network_id: args.virtualNetwork,
			});
		});

		metrics.sendMetricsEvent("get tunnel ip route", {
			sendMetrics: config.send_metrics,
		});

		if (!route || !route.network) {
			logger.log(`\nNo route found for IP ${args.ip}`);
			return;
		}

		logger.log(`\nRoute found.`);
		logger.log(`   Network: ${route.network}`);
		logger.log(`   Tunnel ID: ${route.tunnel_id || "N/A"}`);
		if (route.virtual_network_id) {
			logger.log(`   Virtual Network ID: ${route.virtual_network_id}`);
		}
		if (route.comment) {
			logger.log(`   Comment: ${route.comment}`);
		}
	},
});
