import { createCommand } from "../../../../core/create-command";
import { logger } from "../../../../logger";
import { listEventSubscriptions } from "../../../client";
import { getSourceResource, getSourceType } from "./utils";

export const queuesSubscriptionListCommand = createCommand({
	metadata: {
		description: "List event subscriptions for a queue",
		owner: "Product: Queues",
		status: "stable",
	},
	positionalArgs: ["queue"],
	args: {
		queue: {
			describe: "The name of the queue to list subscriptions for",
			type: "string",
			demandOption: true,
		},
		page: {
			describe: "Page number for pagination",
			type: "number",
			default: 1,
		},
		"per-page": {
			describe: "Number of subscriptions per page",
			type: "number",
			default: 20,
		},
		json: {
			describe: "Output in JSON format",
			type: "boolean",
			default: false,
		},
	},
	async handler(args, { config }) {
		const subscriptions = await listEventSubscriptions(config, args.queue, {
			page: args.page,
			per_page: args.perPage,
		});

		if (args.json) {
			logger.log(JSON.stringify(subscriptions, null, 2));
			return;
		}

		if (!subscriptions || subscriptions.length === 0) {
			logger.log(`No event subscriptions found for queue '${args.queue}'.`);
			return;
		}

		logger.log(`Event subscriptions for queue '${args.queue}':`);

		logger.table(
			subscriptions.map((subscription) => ({
				ID: subscription.id,
				Name: subscription.name,
				Source: getSourceType(subscription.source),
				Events: subscription.events.join(", "),
				Resource: getSourceResource(subscription.source),
				Enabled: subscription.enabled ? "Yes" : "No",
			}))
		);
	},
});
