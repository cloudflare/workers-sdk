import { defineNamespace } from "../core";
import "./create";
import "./delete";
import "./get";
import "./list";
import "./update";

defineNamespace({
	command: "wrangler hyperdrive",

	metadata: {
		description: "🚀 Manage Hyperdrive databases",
		status: "stable",
		owner: "Product: Hyperdrive",
	},
});
