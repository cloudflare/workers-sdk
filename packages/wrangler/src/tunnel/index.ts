import { createNamespace } from "../core/create-command";

export const tunnelNamespace = createNamespace({
	metadata: {
		description: "Manage Cloudflare Tunnels",
		status: "stable",
		owner: "Product: Tunnels",
	},
});
