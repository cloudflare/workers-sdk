import { readConfig } from "../../../../../config";
import { logger } from "../../../../../logger";
import { postTypedConsumer } from "../../../../client";
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
			"visibility-timeout": {
				type: "number",
				describe:
					"The number of seconds a message will wait for an acknowledgement before being returned to the queue.",
			},
		});
}

export async function handler(
	args: StrictYargsOptionsToInterface<typeof options>
) {
	const config = readConfig(args.config, args);

	const postTypedConsumerBody: PostTypedConsumerBody = {
		type: "http_pull",
		settings: {
			batch_size: args.batchSize,
			max_retries: args.messageRetries,
			visibility_timeout_ms: args.visibilityTimeout
				? args.visibilityTimeout * 1000
				: undefined,
		},
		dead_letter_queue: args.deadLetterQueue,
	};
	logger.log(`Adding consumer to queue ${args.queueName}.`);

	await postTypedConsumer(config, args.queueName, postTypedConsumerBody);
	logger.log(`Added consumer to queue ${args.queueName}.`);
}
