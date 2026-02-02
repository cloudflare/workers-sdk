import { CommandLineArgsError } from "@cloudflare/workers-utils";
import { createCommand } from "../../../../../../core/create-command";
import { logger } from "../../../../../../logger";
import { postConsumer } from "../../../../client";
import type { PostTypedConsumerBody } from "../../../../client";

export const queuesConsumerHttpAddCommand = createCommand({
	metadata: {
		description: "Add a Queue HTTP Pull Consumer",
		owner: "Product: Queues",
		status: "stable",
	},
	args: {
		"queue-name": {
			type: "string",
			demandOption: true,
			description: "Name of the queue for the consumer",
		},
		"batch-size": {
			type: "number",
			description: "Maximum number of messages per batch",
		},
		"message-retries": {
			type: "number",
			description: "Maximum number of retries for each message",
		},
		"dead-letter-queue": {
			type: "string",
			description: "Queue to send messages that failed to be consumed",
		},
		"visibility-timeout-secs": {
			type: "number",
			description:
				"The number of seconds a message will wait for an acknowledgement before being returned to the queue.",
		},
		"retry-delay-secs": {
			type: "number",
			description: "The number of seconds to wait before retrying a message",
		},
	},
	positionalArgs: ["queue-name"],
	async handler(args, { config }) {
		if (Array.isArray(args.retryDelaySecs)) {
			throw new CommandLineArgsError(
				`Cannot specify --retry-delay-secs multiple times`
			);
		}

		const body = {
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
		} as PostTypedConsumerBody;

		logger.log(`Adding consumer to queue ${args.queueName}.`);
		await postConsumer(config, args.queueName, body);
		logger.log(`Added consumer to queue ${args.queueName}.`);
	},
});
