import { createNamespace } from "../../core/create-command";

export const aiSearchItemsNamespace = createNamespace({
	metadata: {
		description: "Manage indexed items in an AI Search instance",
		status: "open beta",
		owner: "Product: AI",
	},
});
