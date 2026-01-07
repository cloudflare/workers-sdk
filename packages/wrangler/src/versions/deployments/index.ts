import { createNamespace } from "../../core/create-command";

export const deploymentsNamespace = createNamespace({
	metadata: {
		description:
			"🚢 List and view the current and past deployments for your Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
		category: "Compute & AI",
	},
});
