import { readConfig } from "../../../config";
import { prompt } from "../../../dialogs";
import { FatalError } from "../../../errors";
import isInteractive from "../../../is-interactive";
import { purgeQueue } from "../../client";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return yargs.positional("name", {
		type: "string",
		demandOption: true,
		description: "The name of the queue",
	});
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args);

	if (isInteractive()) {
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
}
