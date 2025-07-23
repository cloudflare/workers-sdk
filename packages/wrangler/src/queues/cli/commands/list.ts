import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { listQueues } from "../../client";

export const queuesListCommand = createCommand({
	metadata: {
		description: "List queues",
		status: "stable",
		owner: "Product: Queues",
	},
	args: {
		page: {
			type: "number",
			describe: "Page number for pagination",
		},
	},
	async handler(args, { config }) {
		const queues = await listQueues(config, args.page);
		logger.table(
			queues.map((queue) => ({
				id: queue.queue_id,
				name: queue.queue_name,
				created_on: queue.created_on,
				modified_on: queue.modified_on,
				producers: queue.producers_total_count.toString(),
				consumers: queue.consumers_total_count.toString(),
			}))
		);
	},
});
