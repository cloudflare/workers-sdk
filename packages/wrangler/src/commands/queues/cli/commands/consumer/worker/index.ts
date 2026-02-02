import { createNamespace } from "../../../../../../core/create-command";

export const queuesConsumerWorkerNamespace = createNamespace({
	metadata: {
		description: "Configure Queue Worker Consumers",
		owner: "Product: Queues",
		status: "stable",
	},
});
