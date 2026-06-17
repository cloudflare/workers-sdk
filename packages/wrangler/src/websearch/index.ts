import { createNamespace } from "../core/create-command";

export const websearchNamespace = createNamespace({
	metadata: {
		description: "🔎 Run queries against Cloudflare Web Search",
		status: "experimental",
		owner: "Product: Web Search",
		category: "Compute & AI",
	},
});
