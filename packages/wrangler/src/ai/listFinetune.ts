import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { listFinetuneEntries, truncateDescription } from "./utils";
import type { Finetune } from "./types";

export const aiFineTuneListCommand = createCommand({
	metadata: {
		description: "List your finetune files",
		status: "stable",
		owner: "Product: AI",
		logArgs: true,
	},
	behaviour: {
		printBanner: (args) => !args.json,
	},
	args: {
		json: {
			type: "boolean",
			description: "Return output as clean JSON",
			default: false,
		},
	},
	async handler({ json }, { config }) {
		const accountId = await requireAuth(config);
		const entries = await listFinetuneEntries(config, accountId);

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
