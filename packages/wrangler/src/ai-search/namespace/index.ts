import { createNamespace } from "../../core/create-command";

export const aiSearchNamespaceNamespace = createNamespace({
	metadata: {
		description: "Manage AI Search namespaces",
		status: "open beta",
		owner: "Product: AI Search",
	},
});
