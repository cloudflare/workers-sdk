import { defineNamespace } from "../../core";
import "./info";
import "./restore";

defineNamespace({
	command: "wrangler d1 time-travel",

	metadata: {
		description:
			"Use Time Travel to restore, fork or copy a database at a specific point-in-time",
		status: "stable",
		owner: "Product: D1",
	},
});
