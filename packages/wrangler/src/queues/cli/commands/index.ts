import { defineNamespace } from "../../../core";
import "./list";
import "./create";
import "./delete";
import "./consumer";

defineNamespace({
	command: "wrangler queues",

	metadata: {
		description: "🇶  Manage Workers Queues",
		status: "stable",
		owner: "Product: Queues",
	},
});
