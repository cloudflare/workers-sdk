import { createNamespace } from "../core/create-command";

export const agentMemoryNamespace = createNamespace({
	metadata: {
		description: "🧠 Manage Agent Memory namespaces",
		status: "open beta",
		owner: "Product: Agent Memory",
		category: "Compute & AI",
	},
});

export const agentMemoryNamespaceNamespace = createNamespace({
	metadata: {
		description: "Manage Agent Memory namespaces",
		status: "open beta",
		owner: "Product: Agent Memory",
	},
});
