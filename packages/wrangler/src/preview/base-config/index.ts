import { createNamespace } from "../../core/create-command";

export const previewBaseConfigNamespace = createNamespace({
	metadata: {
		description: "Manage the Preview base config shared by Worker Previews",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
		hideGlobalFlags: ["script"],
	},
});
