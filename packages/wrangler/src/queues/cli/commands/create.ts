import { readConfig } from "../../../config";
import { logger } from "../../../logger";
import { createQueue, CreateQueueBody, QueueSettings } from "../../client";
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
		.options({
			"delivery-delay": {
				type: "number",
				describe: "TBD",
			}
		})
		.options({
			"no-delivery-delay": {
				type: "boolean",
				describe: "TBD",
			}
		});
}

function createBody(args: StrictYargsOptionsToInterface<typeof options>): CreateQueueBody {
	return {
		queue_name: args.name
	}
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);
	const body = createBody(args);

	logger.log(`Creating queue ${args.name}.`);
	await createQueue(config, body);
	logger.log(`Created queue ${args.name}.`);
}
