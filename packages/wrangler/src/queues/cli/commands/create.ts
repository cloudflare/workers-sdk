import { type Argv } from "yargs";
import { readConfig } from "../../../config";
import { logger } from "../../../logger";
import { createQueue } from "../../client";
import type {
	CommonYargsOptions,
	StrictYargsOptionsToInterface,
} from "../../../yargs-types";

export function options(yargs: Argv<CommonYargsOptions>) {
	return yargs.positional("name", {
		type: "string",
		demandOption: true,
		description: "The name of the queue",
	});
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);

	logger.log(`Creating queue ${args.name}.`);
	await createQueue(config, { queue_name: args.name });
	logger.log(`Created queue ${args.name}.`);
}
