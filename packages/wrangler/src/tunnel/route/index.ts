import { createNamespace } from "../../core/create-command";

export const tunnelRouteNamespace = createNamespace({
	metadata: {
		description:
			"Configure routing for a Cloudflare Tunnel (DNS hostnames or private IP networks)",
		status: "stable",
		owner: "Product: Tunnels",
	},
});
