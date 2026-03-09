import { createNamespace } from "../../../../core/create-command";

export const queuesSubscriptionNamespace = createNamespace({
	metadata: {
		description: "Manage event subscriptions for a queue",
		owner: "Product: Queues",
		status: "stable",
	},
});
