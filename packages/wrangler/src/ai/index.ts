import { createNamespace } from "../core/create-command";

export const aiNamespace = createNamespace({
	metadata: {
		description: "🤖 Manage AI models",
		status: "stable",
		owner: "Product: AI",
		category: "Compute & AI",
	},
});

export const aiFineTuneNamespace = createNamespace({
	metadata: {
		description: "Interact with finetune files",
		status: "stable",
		owner: "Product: AI",
	},
});
