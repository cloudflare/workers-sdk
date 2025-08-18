import { createCommand } from "../../../../core/create-command";
import { confirm } from "../../../../dialogs";
import { logger } from "../../../../logger";
import {
	deleteEventSubscription,
	getEventSubscriptionForQueue,
} from "../../../client";

export const queuesSubscriptionDeleteCommand = createCommand({
	metadata: {
		description: "Delete an event subscription from a queue",
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
			describe: "The ID of the subscription to delete",
			type: "string",
			demandOption: true,
		},
		force: {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "y",
			default: false,
		},
	},
	async handler(args, { config }) {
		const subscription = await getEventSubscriptionForQueue(
			config,
			args.queue,
			args.id
		);

		if (!args.force) {
			const confirmedDelete = await confirm(
				`Are you sure you want to delete the event subscription '${subscription.name}' (${args.id})?`
			);
			if (!confirmedDelete) {
				logger.log("Delete cancelled.");
				return;
			}
		}

		await deleteEventSubscription(config, args.id);

		logger.log(
			`✨ Successfully deleted event subscription '${subscription.name}' with id '${subscription.id}'.`
		);
	},
});
