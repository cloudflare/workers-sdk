import { withConfig } from "../config";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { asJson } from "../yargs-types";
import { listFinetuneEntries, truncateDescription } from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Finetune } from "./types";

export function options(yargs: CommonYargsArgv) {
	return asJson(yargs);
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof options>;
export const handler = withConfig<HandlerOptions>(
	async ({ json, config }): Promise<void> => {
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
	}
);
