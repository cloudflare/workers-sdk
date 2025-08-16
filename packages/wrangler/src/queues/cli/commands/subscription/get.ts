import { createCommand } from "../../../../core/create-command";
import { logger } from "../../../../logger";
import formatLabelledValues from "../../../../utils/render-labelled-values";
import { getEventSubscriptionForQueue } from "../../../client";
import { getSourceResource, getSourceType } from "./utils";

export const queuesSubscriptionGetCommand = createCommand({
	metadata: {
		description: "Get details about a specific event subscription",
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
			describe: "The ID of the subscription to retrieve",
			type: "string",
			demandOption: true,
		},
		json: {
			describe: "Output in JSON format",
			type: "boolean",
			default: false,
		},
	},
	async handler(args, { config }) {
		const subscription = await getEventSubscriptionForQueue(
			config,
			args.queue,
			args.id
		);

		if (args.json) {
			logger.log(JSON.stringify(subscription, null, 2));
			return;
		}

		const resource = getSourceResource(subscription.source);
		const output = {
			ID: subscription.id,
			Name: subscription.name,
			Source: getSourceType(subscription.source),
			...(resource && { Resource: resource }),
			"Queue ID": subscription.destination.queue_id,
			Events: subscription.events.join(", "),
			Enabled: subscription.enabled ? "Yes" : "No",
			"Created At": new Date(subscription.created_at).toLocaleString(),
			"Modified At": new Date(subscription.modified_at).toLocaleString(),
		};

		logger.log(formatLabelledValues(output));
	},
});
