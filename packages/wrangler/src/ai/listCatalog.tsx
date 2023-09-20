import { withConfig } from "../config";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { asJson } from "./options";
import { listCatalogEntries, truncate } from "./utils";
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
			logger.table(
				entries.map((entry) => ({
					model: entry.id,
					name: entry.name,
					description: truncate(entry.description ?? "", 100),
					task: entry.task ? entry.task.name : "",
				}))
			);
		}
	}
);
