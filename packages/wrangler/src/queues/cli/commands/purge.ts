import { readConfig } from "../../../config";
import { prompt } from "../../../dialogs";
import { FatalError } from "../../../errors";
import isInteractive from "../../../is-interactive";
import { logger } from "../../../logger";
import { purgeQueue } from "../../client";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			type: "string",
			demandOption: true,
			description: "The name of the queue",
		})
		.option("force", {
			describe: "Skip the confirmation dialog and forcefully purge the Queue",
			type: "boolean",
		});
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args);

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
}
