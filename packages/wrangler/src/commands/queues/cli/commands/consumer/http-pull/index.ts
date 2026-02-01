import { createNamespace } from "../../../../../../core/create-command";

export const queuesConsumerHttpNamespace = createNamespace({
	metadata: {
		description: "Configure Queue HTTP Pull Consumers",
		owner: "Product: Queues",
		status: "stable",
	},
});
