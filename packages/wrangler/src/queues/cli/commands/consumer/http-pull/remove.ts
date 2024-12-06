import { readConfig } from "../../../../../config";
import { logger } from "../../../../../logger";
import { deletePullConsumer } from "../../../../client";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../../../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return yargs.positional("queue-name", {
		type: "string",
		demandOption: true,
		description: "Name of the queue for the consumer",
	});
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig({ configPath: args.config, args });

	logger.log(`Removing consumer from queue ${args.queueName}.`);
	await deletePullConsumer(config, args.queueName);

	logger.log(`Removed consumer from queue ${args.queueName}.`);
}
