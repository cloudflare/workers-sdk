import { readConfig } from "../../../config";
import { logger } from "../../../logger";
import type { CreateQueueBody } from "../../client";
import { createQueue } from "../../client";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../yargs-types";
import { UserError } from "../../../errors";
import { handleFetchError } from "../../utils";

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
				describe: "How long a published messages should be delayed for, in seconds. Must be a positive integer",
			},
			"no-delivery-delay": {
				type: "boolean",
				describe: "Sets published messages to have no delay",
				boolean: true,
			}
		});
}

function createBody(args: StrictYargsOptionsToInterface<typeof options>): CreateQueueBody {
	const body: CreateQueueBody = {
		queue_name: args.name
	}

	// Workaround, Yargs does not play nicely with both --parameter and --no-parameter set.
	// Negating a number parameter returns 0, making deliveryDelay an array with [0, <value>]
	if(Array.isArray(args.deliveryDelay)) {
		throw new UserError(`Error: can't use --no-delivery-delay with --delivery-delay`);
	}

	if(args.deliveryDelay != undefined) {
		body.settings = {
			delivery_delay: args.deliveryDelay
		}
	}

	return body
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);
	const body = createBody(args);
	try {
		logger.log(`Creating queue ${args.name}.`);
		await createQueue(config, body);
		logger.log(`Created queue ${args.name}.`);
	} catch(e) {
		handleFetchError(e as {code?: number})
		throw e;
	}
}
