import { createCommand } from "../../../../core/create-command";
import { UserError } from "../../../../errors";
import { logger } from "../../../../logger";
import {
	getEventSubscriptionForQueue,
	updateEventSubscription,
} from "../../../client";

export const queuesSubscriptionUpdateCommand = createCommand({
	metadata: {
		description: "Update an existing event subscription",
		owner: "Product: Queues",
		status: "stable",
	},
	positionalArgs: ["queue"],
	args: {
		queue: {
			describe: "The name of the queue",
			type: "string",
			demandOption: true,
		},
		id: {
			describe: "The ID of the subscription to update",
			type: "string",
			demandOption: true,
		},
		name: {
			describe: "New name for the subscription",
			type: "string",
		},
		events: {
			describe: "Comma-separated list of event types to subscribe to",
			type: "string",
		},
		enabled: {
			describe: "Whether the subscription should be active",
			type: "boolean",
		},
		json: {
			describe: "Output in JSON format",
			type: "boolean",
			default: false,
		},
	},
	async handler(args, { config }) {
		const updateRequest: {
			name?: string;
			events?: string[];
			enabled?: boolean;
		} = {};

		if (args.name !== undefined) {
			updateRequest.name = args.name;
		}

		if (args.events !== undefined) {
			const events = args.events
				.split(",")
				.map((event) => event.trim())
				.filter(Boolean);

			if (events.length === 0) {
				throw new UserError("At least one event must be specified");
			}

			updateRequest.events = events;
		}

		if (args.enabled !== undefined) {
			updateRequest.enabled = args.enabled;
		}

		// Check if any updates were provided
		if (Object.keys(updateRequest).length === 0) {
			throw new UserError(
				"At least one field must be specified to update (--name, --events, or --enabled)"
			);
		}

		// Validate subscription belongs to queue
		await getEventSubscriptionForQueue(config, args.queue, args.id);

		logger.log("Updating event subscription...");

		const updatedSubscription = await updateEventSubscription(
			config,
			args.id,
			updateRequest
		);

		if (args.json) {
			logger.log(JSON.stringify(updatedSubscription, null, 2));
			return;
		}

		logger.log(
			`✨ Successfully updated event subscription '${updatedSubscription.name}' (${args.id}).`
		);
	},
});
