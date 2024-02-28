import { readConfig } from "../../../../config";
import { logger } from "../../../../logger";
import type { PostConsumerBody } from "../../../client";
import { postConsumer } from "../../../client";
import type { CommonYargsArgv, StrictYargsOptionsToInterface } from "../../../../yargs-types";
import { handleFetchError } from "../../../utils";
import { CommandLineArgsError } from "../../../../index";

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
		})
		.options({
			"batch-size": {
				type: "number",
				describe: "Maximum number of messages per batch",
			},
			"batch-timeout": {
				type: "number",
				describe:
					"Maximum number of seconds to wait to fill a batch with messages",
			},
			"message-retries": {
				type: "number",
				describe: "Maximum number of retries for each message",
			},
			"dead-letter-queue": {
				type: "string",
				describe: "Queue to send messages that failed to be consumed",
			},
			"max-concurrency": {
				type: "number",
				describe:
					"The maximum number of concurrent consumer Worker invocations. Must be a positive integer",
			},
			"retry-delay": {
				type: "number",
				describe: "How long a retried messages should be delayed for, in seconds. Must be a positive integer",
				number: true,
			}
		});
}

function createBody(args: StrictYargsOptionsToInterface<typeof options>): PostConsumerBody {
	const body: PostConsumerBody = {
		script_name: args.scriptName,
		// TODO(soon) is this still the correct usage of the environment?
		environment_name: args.env ?? "", // API expects empty string as default
		settings: {
			batch_size: args.batchSize,
			max_retries: args.messageRetries,
			max_wait_time_ms: args.batchTimeout // API expects milliseconds
				? 1000 * args.batchTimeout
				: undefined,
			max_concurrency: args.maxConcurrency,
		},
		dead_letter_queue: args.deadLetterQueue,
	};


	// Workaround, Yargs does not play nicely with both --parameter and --no-parameter set.
	// Negating a number parameter returns 0, making retryDelay an array with [0, <value>]
	if(Array.isArray(args.retryDelay)) {
		throw new CommandLineArgsError(`Error: can't use more than a delay setting.`);
	}

	if(args.retryDelay != undefined) {
		body.settings.retry_delay = args.retryDelay
	}

	return body;
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);
	const body = createBody(args);

	try {
		logger.log(`Adding consumer to queue ${args.queueName}.`);
		await postConsumer(config, args.queueName, body);
		logger.log(`Added consumer to queue ${args.queueName}.`);
	} catch(e) {
		handleFetchError(e as {code?: number})
	}
}
