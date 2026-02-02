import { createCommand } from "../../../../../../core/create-command";
import { logger } from "../../../../../../logger";
import { deletePullConsumer } from "../../../../client";

export const queuesConsumerHttpRemoveCommand = createCommand({
	metadata: {
		description: "Remove a Queue HTTP Pull Consumer",
		owner: "Product: Queues",
		status: "stable",
	},
	args: {
		"queue-name": {
			type: "string",
			demandOption: true,
			description: "Name of the queue for the consumer",
		},
	},
	positionalArgs: ["queue-name"],
	async handler(args, { config }) {
		logger.log(`Removing consumer from queue ${args.queueName}.`);
		await deletePullConsumer(config, args.queueName);

		logger.log(`Removed consumer from queue ${args.queueName}.`);
	},
});
