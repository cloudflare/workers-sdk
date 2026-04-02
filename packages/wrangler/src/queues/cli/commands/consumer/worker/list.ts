import { createCommand } from "../../../../../core/create-command";
import { logger } from "../../../../../logger";
import { listConsumers } from "../../../../client";
import type { Consumer } from "../../../../client";

export function mapWorkerConsumerForDisplay(consumer: Consumer) {
	return {
		consumer_id: consumer.consumer_id,
		script: consumer.script ?? consumer.service ?? "-",
		dead_letter_queue: consumer.dead_letter_queue ?? "-",
		batch_size: consumer.settings.batch_size?.toString() ?? "-",
		max_retries: consumer.settings.max_retries?.toString() ?? "-",
		max_wait_time_ms: consumer.settings.max_wait_time_ms?.toString() ?? "-",
		max_concurrency: consumer.settings.max_concurrency?.toString() ?? "-",
		retry_delay: consumer.settings.retry_delay?.toString() ?? "-",
	};
}

export const queuesConsumerWorkerListCommand = createCommand({
	metadata: {
		description: "List worker consumers for a queue",
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
		const workerConsumers = consumers.filter((c) => c.type === "worker");

		if (workerConsumers.length === 0) {
			logger.log(`No worker consumers found for queue "${args.queueName}".`);
			return;
		}

		logger.table(workerConsumers.map(mapWorkerConsumerForDisplay));
	},
});
