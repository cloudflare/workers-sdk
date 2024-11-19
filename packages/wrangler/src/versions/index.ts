import { defineNamespace } from "../core";

defineNamespace({
	command: "wrangler versions",
	metadata: {
		description:
			"🫧  List, view, upload and deploy Versions of your Worker to Cloudflare",
		status: "open-beta",
		owner: "Workers: Authoring and Testing",
	},
});
