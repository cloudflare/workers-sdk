import { withConfig } from "../config";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { asJson } from "./options";
import { constellationBetaWarning, listCatalogEntries } from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return asJson(yargs).epilogue(constellationBetaWarning);
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof options>;
export const handler = withConfig<HandlerOptions>(
	async ({ json, config }): Promise<void> => {
		const accountId = await requireAuth(config);
		const entries = await listCatalogEntries(accountId);

		if (json) {
			logger.log(JSON.stringify(entries, null, 2));
		} else {
			logger.log(constellationBetaWarning);
			logger.table(
				entries.map((entry) => ({
					project_id: entry.project.id,
					project_name: entry.project.name,
					project_runtime: entry.project.runtime,
					models: entry.models.map((model) => model.name).join(","),
				}))
			);
		}
	}
);
