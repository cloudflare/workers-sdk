import { createNamespace } from "../core/create-command";

export const versionsNamespace = createNamespace({
	metadata: {
		description:
			"🫧 List, view, upload, deploy, and rollback Versions of your Worker to Cloudflare",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		category: "Compute & AI",
	},
});
