import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { listCatalogEntries, truncateDescription } from "./utils";

export const aiModelsCommand = createCommand({
	metadata: {
		description: "List catalog models",
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
		const entries = await listCatalogEntries(config, accountId);

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
