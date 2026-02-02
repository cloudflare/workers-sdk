import { CommandLineArgsError } from "@cloudflare/workers-utils";
import { createCommand } from "../../../../../../core/create-command";
import { logger } from "../../../../../../logger";
import { postConsumer } from "../../../../client";

export const queuesConsumerAddCommand = createCommand({
	metadata: {
		description: "Add a Queue Worker Consumer",
		owner: "Product: Queues",
		status: "stable",
	},
	args: {
		"queue-name": {
			type: "string",
			demandOption: true,
			description: "Name of the queue to configure",
		},
		"script-name": {
			type: "string",
			demandOption: true,
			description: "Name of the consumer script",
		},
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
		"retry-delay-secs": {
			type: "number",
			describe: "The number of seconds to wait before retrying a message",
		},
	},
	positionalArgs: ["queue-name", "script-name"],
	async handler(args, { config }) {
		if (Array.isArray(args.retryDelaySecs)) {
			throw new CommandLineArgsError(
				`Cannot specify --retry-delay-secs multiple times`
			);
		}

		const body = {
			script_name: args.scriptName,
			// TODO(soon) is this still the correct usage of the environment?
			environment_name: args.env ?? "", // API expects empty string as default
			type: "worker",
			settings: {
				batch_size: args.batchSize,
				max_retries: args.messageRetries,
				max_wait_time_ms:
					args.batchTimeout !== undefined // API expects milliseconds
						? 1000 * args.batchTimeout
						: undefined,
				max_concurrency: args.maxConcurrency,
				retry_delay: args.retryDelaySecs,
			},
			dead_letter_queue: args.deadLetterQueue,
		};

		logger.log(`Adding consumer to queue ${args.queueName}.`);
		await postConsumer(config, args.queueName, body);
		logger.log(`Added consumer to queue ${args.queueName}.`);
	},
});
