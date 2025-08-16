import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { deleteQueue } from "../../client";

export const queuesDeleteCommand = createCommand({
	metadata: {
		description: "Delete a queue",
		owner: "Product: Queues",
		status: "stable",
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the queue",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		logger.log(`Deleting queue ${args.name}.`);
		await deleteQueue(config, args.name);
		logger.log(`Deleted queue ${args.name}.`);
	},
});
