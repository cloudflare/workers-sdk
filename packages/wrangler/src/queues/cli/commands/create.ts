import { readConfig } from "../../../config";
import { CommandLineArgsError } from "../../../index";
import { logger } from "../../../logger";
import { createQueue } from "../../client";
import { handleFetchError } from "../../utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../yargs-types";
import type { PostQueueBody } from "../../client";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("name", {
			type: "string",
			demandOption: true,
			description: "The name of the queue",
		})
		.options({
			"delivery-delay-secs": {
				type: "number",
				describe:
					"How long a published message should be delayed for, in seconds. Must be a positive integer",
			},
			"message-retention-period-secs": {
				type: "number",
				describe:
					"How long to retain a message in the queue, in seconds. Must be a positive integer",
			},
		});
}

function createBody(
	args: StrictYargsOptionsToInterface<typeof options>
): PostQueueBody {
	const body: PostQueueBody = {
		queue_name: args.name,
	};

	if (Array.isArray(args.deliveryDelaySecs)) {
		throw new CommandLineArgsError(
			"Cannot specify --delivery-delay-secs multiple times"
		);
	}

	if (Array.isArray(args.messageRetentionPeriodSecs)) {
		throw new CommandLineArgsError(
			"Cannot specify --message-retention-period-secs multiple times"
		);
	}

	body.settings = {};

	if (args.deliveryDelaySecs != undefined) {
		body.settings.delivery_delay = args.deliveryDelaySecs;
	}

	if (args.messageRetentionPeriodSecs != undefined) {
		body.settings.message_retention_period = args.messageRetentionPeriodSecs;
	}

	return body;
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
	} catch (e) {
		handleFetchError(e as { code?: number });
	}
}
