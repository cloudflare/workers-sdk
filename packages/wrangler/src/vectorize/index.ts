import { createNamespace } from "../core/create-command";

export const vectorizeNamespace = createNamespace({
	metadata: {
		description: "🧮 Manage Vectorize indexes",
		status: "stable",
		owner: "Product: Vectorize",
		category: "Storage & databases",
	},
});
