import { createNamespace } from "../core/create-command";

export const workflowsNamespace = createNamespace({
	metadata: {
		description: "🔁 Manage Workflows",
		owner: "Product: Workflows",
		status: "stable",
		category: "Compute & AI",
	},
});

export const workflowsInstanceNamespace = createNamespace({
	metadata: {
		description: "Manage Workflow instances",
		owner: "Product: Workflows",
		status: "stable",
	},
});
