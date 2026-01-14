import { createNamespace } from "../../../core/create-command";

export const queuesNamespace = createNamespace({
	metadata: {
		description: "📬 Manage Workers Queues",
		owner: "Product: Queues",
		status: "stable",
		category: "Compute & AI",
	},
});
