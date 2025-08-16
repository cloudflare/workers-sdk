import { createCommand } from "../../../core/create-command";
import { prompt } from "../../../dialogs";
import { FatalError } from "../../../errors";
import isInteractive from "../../../is-interactive";
import { logger } from "../../../logger";
import { purgeQueue } from "../../client";

export const queuesPurgeCommand = createCommand({
	metadata: {
		description: "Purge messages from a queue",
		owner: "Product: Queues",
		status: "stable",
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the queue",
		},
		force: {
			describe: "Skip the confirmation dialog and forcefully purge the Queue",
			type: "boolean",
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
		if (!args.force && !isInteractive()) {
			throw new FatalError(
				"The --force flag is required to purge a Queue in non-interactive mode"
			);
		}

		if (!args.force && isInteractive()) {
			const result = await prompt(
				`This operation will permanently delete all the messages in Queue ${args.name}. Type ${args.name} to proceed.`
			);

			if (result !== args.name) {
				throw new FatalError(
					"Incorrect queue name provided. Skipping purge operation"
				);
			}
		}
		await purgeQueue(config, args.name);

		logger.log(`Purged Queue '${args.name}'`);
	},
});
