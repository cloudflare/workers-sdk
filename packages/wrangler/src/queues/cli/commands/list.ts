import { readConfig } from "../../../config";
import { defineCommand } from "../../../core";
import { logger } from "../../../logger";
import { listQueues } from "../../client";
import { handleFetchError, handleUnauthorizedError } from "../../utils";

defineCommand({
	command: "wrangler queues list",

	metadata: {
		description: "List Queues",
		status: "stable",
		owner: "Product: Queues",
	},

	args: {
		page: {
			type: "number",
			describe: "Page number for pagination",
		},
	},

	async handler(args) {
		const config = readConfig(args.config, args);

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

	handleError: handleUnauthorizedError,
});
