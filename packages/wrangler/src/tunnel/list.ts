import { createCommand } from "../core/create-command";
import { requireAuth } from "../user";
import { listTunnels } from "./client";

export const tunnelListCommand = createCommand({
	metadata: {
		description: "List all Cloudflare Tunnels in your account",
		status: "experimental",
		owner: "Product: Tunnels",
	},
	args: {},
	behaviour: { printBanner: false, printResourceLocation: false },
	async handler(args, { config, logger, sdk }) {
		const accountId = await requireAuth(config);

		logger.log(`Listing Cloudflare Tunnels`);

		const tunnels = await listTunnels(sdk, accountId);

		if (tunnels.length === 0) {
			logger.log("No tunnels found.");
			return;
		}

		logger.table(
			tunnels.map((tunnel) => ({
				id: tunnel.id ?? "",
				name: tunnel.name ?? "",
				status: tunnel.status ?? "unknown",
				created_at: tunnel.created_at
					? new Date(tunnel.created_at).toLocaleString()
					: "",
				tun_type: tunnel.tun_type ?? "cfd_tunnel",
			}))
		);
	},
});
