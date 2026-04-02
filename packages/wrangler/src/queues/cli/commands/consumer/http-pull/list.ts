import { createCommand } from "../../../../../core/create-command";
import { logger } from "../../../../../logger";
import { listConsumers } from "../../../../client";
import type { Consumer } from "../../../../client";

export function mapHttpConsumerForDisplay(consumer: Consumer) {
	return {
		consumer_id: consumer.consumer_id,
		dead_letter_queue: consumer.dead_letter_queue ?? "-",
		batch_size: consumer.settings.batch_size?.toString() ?? "-",
		max_retries: consumer.settings.max_retries?.toString() ?? "-",
		visibility_timeout_ms:
			consumer.settings.visibility_timeout_ms?.toString() ?? "-",
		retry_delay: consumer.settings.retry_delay?.toString() ?? "-",
	};
}

export const queuesConsumerHttpListCommand = createCommand({
	metadata: {
		description: "List HTTP pull consumers for a queue",
		owner: "Product: Queues",
		status: "stable",
	},
	args: {
		"queue-name": {
			type: "string",
			demandOption: true,
			description: "Name of the queue",
		},
	},
	positionalArgs: ["queue-name"],
	async handler(args, { config }) {
		const consumers = await listConsumers(config, args.queueName);
		const httpConsumers = consumers.filter((c) => c.type === "http_pull");

		if (httpConsumers.length === 0) {
			logger.log(`No HTTP pull consumers found for queue "${args.queueName}".`);
			return;
		}

		logger.table(httpConsumers.map(mapHttpConsumerForDisplay));
	},
});
