import { readConfig } from "../../../../../../../wrangler-shared/src/config";
import { logger } from "../../../../../logger";
import { deleteWorkerConsumer } from "../../../../client";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../../../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("queue-name", {
			type: "string",
			demandOption: true,
			description: "Name of the queue to configure",
		})
		.positional("script-name", {
			type: "string",
			demandOption: true,
			description: "Name of the consumer script",
		});
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args);

	logger.log(`Removing consumer from queue ${args.queueName}.`);
	await deleteWorkerConsumer(config, args.queueName, args.scriptName, args.env);
	logger.log(`Removed consumer from queue ${args.queueName}.`);
}
