import { defineCommand, SharedArgs } from "../core";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { listFinetuneEntries, truncateDescription } from "./utils";
import type { Finetune } from "./types";

defineCommand({
	command: "wrangler ai finetune list",

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
		const entries = await listFinetuneEntries(accountId);

		if (json) {
			logger.log(JSON.stringify(entries, null, 2));
		} else {
			if (entries.length === 0) {
				logger.log(`No finetune assets found.`);
			} else {
				logger.table(
					entries.map((entry: Finetune) => ({
						finetune_id: entry.id,
						name: entry.name,
						description: truncateDescription(
							entry.description,
							entry.id.length + entry.name.length + 10
						),
					}))
				);
			}
		}
	},
});
