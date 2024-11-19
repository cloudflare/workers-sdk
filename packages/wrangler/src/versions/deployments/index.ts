import { defineNamespace } from "../../core";

defineNamespace({
	command: "wrangler deployments",
	metadata: {
		description:
			"🚢 List and view the current and past deployments for your Worker",
		status: "open-beta",
		owner: "Workers: Authoring and Testing",
	},
});
