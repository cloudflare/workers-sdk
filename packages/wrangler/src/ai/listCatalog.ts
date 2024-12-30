import { withConfig } from "../../../wrangler-shared/src/config";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { asJson } from "../yargs-types";
import { listCatalogEntries, truncateDescription } from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return asJson(yargs);
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof options>;
export const handler = withConfig<HandlerOptions>(
	async ({ json, config }): Promise<void> => {
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
	}
);
