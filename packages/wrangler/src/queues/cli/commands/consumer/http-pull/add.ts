import { readConfig } from "../../../../../../../wrangler-shared/src/config";
import { CommandLineArgsError } from "../../../../../errors";
import { logger } from "../../../../../logger";
import { postConsumer } from "../../../../client";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../../../../yargs-types";
import type { PostTypedConsumerBody } from "../../../../client";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("queue-name", {
			type: "string",
			demandOption: true,
			description: "Name of the queue for the consumer",
		})
		.options({
			"batch-size": {
				type: "number",
				describe: "Maximum number of messages per batch",
			},
			"message-retries": {
				type: "number",
				describe: "Maximum number of retries for each message",
			},
			"dead-letter-queue": {
				type: "string",
				describe: "Queue to send messages that failed to be consumed",
			},
			"visibility-timeout-secs": {
				type: "number",
				describe:
					"The number of seconds a message will wait for an acknowledgement before being returned to the queue.",
			},
			"retry-delay-secs": {
				type: "number",
				describe: "The number of seconds to wait before retrying a message",
			},
		});
}

function createBody(
	args: StrictYargsOptionsToInterface<typeof options>
): PostTypedConsumerBody {
	return {
		type: "http_pull",
		settings: {
			batch_size: args.batchSize,
			max_retries: args.messageRetries,
			visibility_timeout_ms: args.visibilityTimeoutSecs
				? args.visibilityTimeoutSecs * 1000
				: undefined,
			retry_delay: args.retryDelaySecs,
		},
		dead_letter_queue: args.deadLetterQueue,
	};
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args);

	if (Array.isArray(args.retryDelaySecs)) {
		throw new CommandLineArgsError(
			`Cannot specify --retry-delay-secs multiple times`
		);
	}

	const body = createBody(args);

	logger.log(`Adding consumer to queue ${args.queueName}.`);
	await postConsumer(config, args.queueName, body);
	logger.log(`Added consumer to queue ${args.queueName}.`);
}
