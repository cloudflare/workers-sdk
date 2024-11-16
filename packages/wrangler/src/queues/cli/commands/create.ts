import dedent from "ts-dedent";
import { formatConfigSnippet, readConfig } from "../../../config";
import { CommandLineArgsError } from "../../../errors";
import { logger } from "../../../logger";
import { getValidBindingName } from "../../../utils/getValidBindingName";
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

	if (args.deliveryDelaySecs != undefined) {
		body.settings = {
			delivery_delay: args.deliveryDelaySecs,
		};
	}

	return body;
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);
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
				config.parsedFormat
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
				config.parsedFormat
			)}`);
	} catch (e) {
		handleFetchError(e as { code?: number });
	}
}
