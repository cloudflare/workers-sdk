import { createNamespace } from "../core/create-command";

export const basinNamespace = createNamespace({
	metadata: {
		description: "🏞️ Manage Basin products",
		status: "stable",
		owner: "Product: Basin SQL",
		category: "Storage & databases",
	},
});
