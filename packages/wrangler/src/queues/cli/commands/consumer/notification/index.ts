import { createNamespace } from "../../../../../core/create-command";

export const queuesConsumerNotificationNamespace = createNamespace({
	metadata: {
		description: "Configure Queue Notification Consumers",
		owner: "Product: Queues",
		status: "stable",
	},
});
