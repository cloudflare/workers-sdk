import { createCommand } from "../../../../../core/create-command";
import { logger } from "../../../../../logger";
import { listConsumers } from "../../../../client";
import type { Consumer } from "../../../../client";

export function mapNotificationConsumerForDisplay(consumer: Consumer) {
	const ids = (entries?: { id: string }[]) =>
		entries && entries.length > 0
			? entries.map((e) => e.id).join(", ")
			: "-";
	return {
		consumer_id: consumer.consumer_id,
		dead_letter_queue: consumer.dead_letter_queue ?? "-",
		email: ids(consumer.settings.email),
		pagerduty: ids(consumer.settings.pagerduty),
		webhooks: ids(consumer.settings.webhooks),
	};
}

export const queuesConsumerNotificationListCommand = createCommand({
	metadata: {
		description: "List Notification consumers for a queue",
		owner: "Product: Queues",
		status: "stable",
	},
	behaviour: {
		supportTemporary: true,
		printBanner: (args) => !args.json,
	},
	args: {
		"queue-name": {
			type: "string",
			demandOption: true,
			description: "Name of the queue",
		},
		json: {
			describe: "Output in JSON format",
			type: "boolean",
			default: false,
		},
	},
	positionalArgs: ["queue-name"],
	async handler(args, { config }) {
		const consumers = await listConsumers(config, args.queueName);
		const notificationConsumers = consumers.filter(
			(c) => c.type === "notification"
		);

		if (args.json) {
			logger.log(JSON.stringify(notificationConsumers, null, 2));
			return;
		}

		if (notificationConsumers.length === 0) {
			logger.log(
				`No Notification consumers found for queue "${args.queueName}".`
			);
			return;
		}

		logger.table(
			notificationConsumers.map(mapNotificationConsumerForDisplay)
		);
	},
});
