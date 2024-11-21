import { defineNamespace } from "../core";

export function defineVersions() {
	defineNamespace({
		command: "wrangler versions",
		metadata: {
			description:
				"🫧  List, view, upload and deploy Versions of your Worker to Cloudflare",
			status: "stable",
			owner: "Workers: Authoring and Testing",
		},
	});
}
