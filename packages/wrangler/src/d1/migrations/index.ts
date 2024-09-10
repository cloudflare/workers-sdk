import { defineNamespace } from "../../core";
import "./list";
import "./create";
import "./apply";

defineNamespace({
	command: "wrangler d1 migrations",

	metadata: {
		description: "Interact with D1 migrations",
		status: "stable",
		owner: "Product: D1",
	},
});
