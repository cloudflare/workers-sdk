import { createNamespace } from "../core/create-command";

export const aiSearchNamespace = createNamespace({
	metadata: {
		description: "🔍 Manage AI Search instances",
		status: "open beta",
		owner: "Product: AI Search",
		category: "Compute & AI",
	},
});
