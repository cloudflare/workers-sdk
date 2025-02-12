import dedent from "ts-dedent";
import { formatConfigSnippet, readConfig } from "../../../config";
import { CommandLineArgsError } from "../../../errors";
import { logger } from "../../../logger";
import { getValidBindingName } from "../../../utils/getValidBindingName";
import { createQueue } from "../../client";
import {
	MAX_DELIVERY_DELAY_SECS,
	MIN_DELIVERY_DELAY_SECS,
} from "../../constants";
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
					"How long a published message should be delayed for, in seconds. Must be between 0 and 42300",
				default: 0,
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

	body.settings = {};

	if (args.deliveryDelaySecs != undefined) {
		if (
			args.deliveryDelaySecs < MIN_DELIVERY_DELAY_SECS ||
			args.deliveryDelaySecs > MAX_DELIVERY_DELAY_SECS
		) {
			throw new CommandLineArgsError(
				`Invalid --delivery-delay-secs value: ${args.deliveryDelaySecs}. Must be between ${MIN_DELIVERY_DELAY_SECS} and ${MAX_DELIVERY_DELAY_SECS}`
			);
		}
		body.settings.delivery_delay = args.deliveryDelaySecs;
	}

	if (Object.keys(body.settings).length === 0) {
		body.settings = undefined;
	}

	return body;
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args);
	const body = createBody(args);
	try {
		logger.log(`🌀 Creating queue '${args.name}'`);
		await createQueue(config, body);
		logger.log(dedent`
			✅ Created queue '${args.name}'

			Configure your Worker to send messages to this queue:

			${formatConfigSnippet(
				{
					queues: {
						producers: [
							{
								queue: args.name,
								binding: getValidBindingName(args.name, "queue"),
							},
						],
					},
				},
				config.configPath
			)}
			Configure your Worker to consume messages from this queue:

			${formatConfigSnippet(
				{
					queues: {
						consumers: [
							{
								queue: args.name,
							},
						],
					},
				},
				config.configPath
			)}`);
	} catch (e) {
		handleFetchError(e as { code?: number });
	}
}
