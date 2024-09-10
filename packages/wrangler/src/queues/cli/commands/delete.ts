import { readConfig } from "../../../config";
import { defineCommand } from "../../../core";
import { logger } from "../../../logger";
import { deleteQueue } from "../../client";
import { handleFetchError, handleUnauthorizedError } from "../../utils";

defineCommand({
	command: "wrangler queues delete",

	metadata: {
		description: "Delete a Queue",
		status: "stable",
		owner: "Product: Queues",
	},

	args: {
		// TODO(soon) --force option
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the queue",
		},
	},
	positionalArgs: ["name"],

	async handler(args) {
		const config = readConfig(args.config, args);

		logger.log(`Deleting queue ${args.name}.`);
		await deleteQueue(config, args.name);
		logger.log(`Deleted queue ${args.name}.`);
	},

	handleError: handleUnauthorizedError,
});
