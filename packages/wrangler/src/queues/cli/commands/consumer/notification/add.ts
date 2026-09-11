import { CommandLineArgsError } from "@cloudflare/workers-utils";
import { createCommand } from "../../../../../core/create-command";
import { logger } from "../../../../../logger";
import { postConsumer } from "../../../../client";
import type { MechanismEntry, PostTypedConsumerBody } from "../../../../client";

export const queuesConsumerNotificationAddCommand = createCommand({
	metadata: {
		description: "Add a Queue Notification Consumer",
		owner: "Product: Queues",
		status: "stable",
	},
	behaviour: { supportTemporary: true },
	args: {
		"queue-name": {
			type: "string",
			demandOption: true,
			description: "Name of the queue for the consumer",
		},
		email: {
			type: "string",
			array: true,
			description: "Email addresses for notifications",
		},
		pagerduty: {
			type: "string",
			array: true,
			description: "PagerDuty integration keys for notifications",
		},
		webhook: {
			type: "string",
			array: true,
			description: "Webhook IDs for notifications",
		},
		"dead-letter-queue": {
			type: "string",
			description: "Queue to send messages that failed to be consumed",
		},
	},
	positionalArgs: ["queue-name"],
	async handler(args, { config }) {
		const email = args.email ?? [];
		const pagerduty = args.pagerduty ?? [];
		const webhook = args.webhook ?? [];

		if (email.length === 0 && pagerduty.length === 0 && webhook.length === 0) {
			throw new CommandLineArgsError(
				"At least one notification mechanism must be specified (--email, --pagerduty, or --webhook)",
				{
					telemetryMessage:
						"queues notification consumer add no mechanisms",
				}
			);
		}

		const toEntries = (values: string[]): MechanismEntry[] =>
			values.map((id) => ({ id }));

		const body = {
			type: "notification",
			settings: {
				email: toEntries(email),
				pagerduty: toEntries(pagerduty),
				webhooks: toEntries(webhook),
			},
			dead_letter_queue: args.deadLetterQueue,
		} as PostTypedConsumerBody;

		logger.log(`Adding consumer to queue ${args.queueName}.`);
		await postConsumer(config, args.queueName, body);
		logger.log(`Added consumer to queue ${args.queueName}.`);
	},
});
