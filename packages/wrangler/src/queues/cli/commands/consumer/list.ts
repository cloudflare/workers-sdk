import { createCommand } from "../../../../core/create-command";
import { logger } from "../../../../logger";
import { listConsumers } from "../../../client";
import { mapHttpConsumerForDisplay } from "./http-pull/list";
import { mapWorkerConsumerForDisplay } from "./worker/list";

export const queuesConsumerListCommand = createCommand({
	metadata: {
		description: "List consumers for a queue",
		owner: "Product: Queues",
		status: "stable",
	},
	behaviour: {
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

		if (args.json) {
			logger.log(JSON.stringify(consumers, null, 2));
			return;
		}

		if (consumers.length === 0) {
			logger.log(`No consumers found for queue "${args.queueName}".`);
			return;
		}

		const workerConsumers = consumers.filter((c) => c.type === "worker");
		const httpConsumers = consumers.filter((c) => c.type === "http_pull");

		if (workerConsumers.length > 0) {
			logger.log(`Worker consumers:`);
			logger.table(workerConsumers.map(mapWorkerConsumerForDisplay));
		}

		if (httpConsumers.length > 0) {
			logger.log(`HTTP pull consumers:`);
			logger.table(httpConsumers.map(mapHttpConsumerForDisplay));
		}
	},
});
