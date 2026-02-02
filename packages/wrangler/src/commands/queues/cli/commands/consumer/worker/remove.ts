import { createCommand } from "../../../../../../core/create-command";
import { logger } from "../../../../../../logger";
import { deleteWorkerConsumer } from "../../../../client";

export const queuesConsumerRemoveCommand = createCommand({
	metadata: {
		description: "Remove a Queue Worker Consumer",
		owner: "Product: Queues",
		status: "stable",
	},
	args: {
		"queue-name": {
			type: "string",
			demandOption: true,
			description: "Name of the queue to configure",
		},
		"script-name": {
			type: "string",
			demandOption: true,
			description: "Name of the consumer script",
		},
	},
	positionalArgs: ["queue-name", "script-name"],
	async handler(args, { config }) {
		logger.log(`Removing consumer from queue ${args.queueName}.`);
		await deleteWorkerConsumer(
			config,
			args.queueName,
			args.scriptName,
			args.env
		);
		logger.log(`Removed consumer from queue ${args.queueName}.`);
	},
});
