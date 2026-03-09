import { createNamespace } from "../../../../core/create-command";

export const queuesConsumerNamespace = createNamespace({
	metadata: {
		description: "Configure queue consumers",
		owner: "Product: Queues",
		status: "stable",
	},
});
