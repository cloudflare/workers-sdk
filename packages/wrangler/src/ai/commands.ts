import { defineNamespace } from "../core";
import "./listCatalog";
import "./createFinetune";
import "./listFinetune";

defineNamespace({
	command: "wrangler ai",
	metadata: {
		description: "🤖 Manage AI models\n", // TODO: remove \n when yargs --help hack is replaced with full reimplementation
		status: "stable",
		owner: "Product: AI",
	},
});

defineNamespace({
	command: "wrangler ai finetune",
	metadata: {
		description: "Interact with finetune files",
		status: "stable",
		owner: "Product: AI",
	},
});
