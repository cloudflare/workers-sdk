import { defineAlias, defineNamespace } from "../../../../core";
import "./http-pull/add";
import "./http-pull/remove";
import "./worker/add";
import "./worker/remove";

defineNamespace({
	command: "wrangler queues consumer",

	metadata: {
		description: "Configure Queue consumers",
		status: "stable",
		owner: "Product: Queues",
	},
});

defineAlias({
	command: "wrangler queues consumer add",
	aliasOf: "wrangler queues consumer worker add",
	metadata: { hidden: false },
});

defineAlias({
	command: "wrangler queues consumer remove",
	aliasOf: "wrangler queues consumer worker remove",
	metadata: { hidden: false },
});

defineNamespace({
	command: "wrangler queues consumer http",

	metadata: {
		description: "Configure Queue HTTP Pull Consumers",
		status: "stable",
		owner: "Product: Queues",
	},
});

defineNamespace({
	command: "wrangler queues consumer worker",

	metadata: {
		description: "Configure Queue Worker Consumers",
		status: "stable",
		owner: "Product: Queues",
	},
});
