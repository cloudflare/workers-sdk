import { defineNamespace } from "../core";
import "./commands/list";
import "./commands/describe";
import "./commands/delete";
import "./commands/trigger";
import "./commands/instances/list";
import "./commands/instances/describe";
import "./commands/instances/terminate";
import "./commands/instances/pause";
import "./commands/instances/resume";

defineNamespace({
	command: "wrangler workflows",
	metadata: {
		description: "🔁 Manage Workflows",
		owner: "Product: Workflows",
		status: "open-beta",
	},
});

defineNamespace({
	command: "wrangler workflows instances",
	metadata: {
		description: "Manage Workflow instances",
		owner: "Product: Workflows",
		status: "open-beta",
	},
});
