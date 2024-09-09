import { defineCommand, SharedArgs } from "../core";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { listCatalogEntries, truncateDescription } from "./utils";

defineCommand({
	command: "wrangler ai models",

	metadata: {
		description: "List catalog models",
		status: "stable",
		owner: "Product: AI",
	},

	args: {
		...SharedArgs.json,
	},

	async handler({ json }, { config }): Promise<void> {
		const accountId = await requireAuth(config);
		const entries = await listCatalogEntries(accountId);

		if (json) {
			logger.log(JSON.stringify(entries, null, 2));
		} else {
			if (entries.length === 0) {
				logger.log(`No models found.`);
			} else {
				logger.table(
					entries.map((entry) => ({
						model: entry.id,
						name: entry.name,
						description: truncateDescription(
							entry.description,
							entry.id.length +
								entry.name.length +
								(entry.task ? entry.task.name.length : 0) +
								10
						),
						task: entry.task ? entry.task.name : "",
					}))
				);
			}
		}
	},
});
