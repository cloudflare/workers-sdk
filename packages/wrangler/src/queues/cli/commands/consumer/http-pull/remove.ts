import { readConfig } from "../../../../../config";
import { defineCommand } from "../../../../../core";
import { logger } from "../../../../../logger";
import { deletePullConsumer } from "../../../../client";
import { handleUnauthorizedError } from "../../../../utils";

defineCommand({
	command: "wrangler queues consumer http remove",

	metadata: {
		description: "Remove a Queue HTTP Pull Consumer",
		status: "stable",
		owner: "Product: Queues",
	},

	args: {
		"queue-name": {
			type: "string",
			demandOption: true,
			description: "Name of the queue for the consumer",
		},
	},
	positionalArgs: ["queue-name"],

	async handler(args) {
		const config = readConfig(args.config, args);

		logger.log(`Removing consumer from queue ${args.queueName}.`);
		await deletePullConsumer(config, args.queueName);

		logger.log(`Removed consumer from queue ${args.queueName}.`);
	},

	handleError: handleUnauthorizedError,
});
