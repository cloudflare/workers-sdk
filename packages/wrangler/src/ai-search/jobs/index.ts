import { createNamespace } from "../../core/create-command";

export const aiSearchJobsNamespace = createNamespace({
	metadata: {
		description: "AI Search indexing jobs",
		status: "open beta",
		owner: "Product: AI Search",
	},
});
