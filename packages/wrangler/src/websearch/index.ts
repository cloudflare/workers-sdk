import { createNamespace } from "../core/create-command";

export const webSearchNamespace = createNamespace({
	metadata: {
		description: "🔎 Run queries against Cloudflare Web Search",
		status: "experimental",
		owner: "Product: Web Search",
		category: "Compute & AI",
	},
});
