import dedent from "ts-dedent";
import { formatConfigSnippet } from "../../../config";
import { createCommand } from "../../../core/create-command";
import { CommandLineArgsError } from "../../../errors";
import { logger } from "../../../logger";
import { getValidBindingName } from "../../../utils/getValidBindingName";
import { createQueue } from "../../client";
import {
	MAX_DELIVERY_DELAY_SECS,
	MAX_MESSAGE_RETENTION_PERIOD_SECS,
	MIN_DELIVERY_DELAY_SECS,
	MIN_MESSAGE_RETENTION_PERIOD_SECS,
} from "../../constants";
import { handleFetchError } from "../../utils";
import type { PostQueueBody } from "../../client";

export const queuesCreateCommand = createCommand({
	metadata: {
		description: "Create a queue",
		owner: "Product: Queues",
		status: "stable",
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the queue",
		},
		"delivery-delay-secs": {
			type: "number",
			describe:
				"How long a published message should be delayed for, in seconds. Must be between 0 and 42300",
			default: 0,
		},
		"message-retention-period-secs": {
			type: "number",
			describe:
				"How long to retain a message in the queue, in seconds. Must be between 60 and 1209600",
			default: 345600,
		},
	},
	positionalArgs: ["name"],
	async handler(args, { config }) {
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
	},
});

function createBody(args: typeof queuesCreateCommand.args): PostQueueBody {
	const body: PostQueueBody = {
		queue_name: args.name,
	};

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

	if (args.messageRetentionPeriodSecs != undefined) {
		if (
			args.messageRetentionPeriodSecs < MIN_MESSAGE_RETENTION_PERIOD_SECS ||
			args.messageRetentionPeriodSecs > MAX_MESSAGE_RETENTION_PERIOD_SECS
		) {
			throw new CommandLineArgsError(
				`Invalid --message-retention-period-secs value: ${args.messageRetentionPeriodSecs}. Must be between ${MIN_MESSAGE_RETENTION_PERIOD_SECS} and ${MAX_MESSAGE_RETENTION_PERIOD_SECS}`
			);
		}
		body.settings.message_retention_period = args.messageRetentionPeriodSecs;
	}

	if (Object.keys(body.settings).length === 0) {
		body.settings = undefined;
	}

	return body;
}
