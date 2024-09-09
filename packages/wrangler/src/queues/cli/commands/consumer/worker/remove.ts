import { readConfig } from "../../../../../config";
import { defineCommand } from "../../../../../core";
import { logger } from "../../../../../logger";
import { deleteWorkerConsumer } from "../../../../client";
import { handleUnauthorizedError } from "../../../../utils";

defineCommand({
	command: "wrangler queues consumer worker remove",

	metadata: {
		description: "Remove a Queue Worker Consumer",
		status: "stable",
		owner: "Product: Queues",
	},

	args: {
		"queue-name": {
			type: "string",
			demandOption: true,
			describe: "Name of the queue to configure",
		},
		"script-name": {
			type: "string",
			demandOption: true,
			describe: "Name of the consumer script",
		},
	},
	positionalArgs: ["queue-name", "script-name"],

	async handler(args) {
		const config = readConfig(args.config, args);

		logger.log(`Removing consumer from queue ${args.queueName}.`);
		await deleteWorkerConsumer(
			config,
			args.queueName,
			args.scriptName,
			args.env
		);
		logger.log(`Removed consumer from queue ${args.queueName}.`);
	},

	handleError: handleUnauthorizedError,
});
