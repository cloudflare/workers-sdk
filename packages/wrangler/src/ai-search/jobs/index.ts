import { createNamespace } from "../../core/create-command";

export const aiSearchJobsNamespace = createNamespace({
	metadata: {
		description: "Manage indexing jobs for an AI Search instance",
		status: "open beta",
		owner: "Product: AI",
	},
});
