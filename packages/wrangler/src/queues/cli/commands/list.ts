import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { listQueues } from "../../client";

export const queuesListCommand = createCommand({
	metadata: {
		description: "List queues",
		status: "stable",
		owner: "Product: Queues",
	},
	behaviour: { supportTemporary: true },
	args: {
		page: {
			type: "number",
			describe: "Page number for pagination",
		},
	},
	async handler(args, { config }) {
		const queues = await listQueues(config, args.page);

		// A few behaviours we want necessitates this obtuse-looking code:
		//
		// 1. We'd like to hide the `jurisdiction` column entirely if and only if none of the Queues
		//    are jurisdictional. The table logger will do this for us if none of the objects we pass
		//    to it have a `jurisdiction` property.
		//
		// 2. The table logger calculates which columns to print out by looking at the _first_ object
		// 		passed to it. We'd like to make sure the `jurisdiction` column is definitely printed out
		// 		if any Queue is in a jurisdiction.
		//
		// 3. We'd like for this `jurisdiction` column (if present) to show up next to the queue name.
		//    The table logger prints columns out in the order properties are set on the _first_ object.
		//    Technically JS does not guarantee property ordering in objects, but in practice it often
		//    works out that way.

		const hasJurisdictions = queues.some((q) => q.jurisdiction !== undefined);
		if (hasJurisdictions) {
			logger.table(
				queues.map((q) => ({
					id: q.queue_id,
					name: q.queue_name,
					jurisdiction: q.jurisdiction ?? "",
					created_on: q.created_on,
					modified_on: q.modified_on,
					producers: q.producers_total_count.toString(),
					consumers: q.consumers_total_count.toString(),
				}))
			);
		} else {
			logger.table(
				queues.map((q) => ({
					id: q.queue_id,
					name: q.queue_name,
					created_on: q.created_on,
					modified_on: q.modified_on,
					producers: q.producers_total_count.toString(),
					consumers: q.consumers_total_count.toString(),
				}))
			);
		}
	},
});
