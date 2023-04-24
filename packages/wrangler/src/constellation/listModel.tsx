import { withConfig } from "../config";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { takeName } from "./options";
import {
	constellationBetaWarning,
	getProjectByName,
	listModels,
} from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Project } from "./types";

export function options(yargs: CommonYargsArgv) {
	return takeName(yargs)
		.option("json", {
			describe: "return output as clean JSON",
			type: "boolean",
			default: false,
		})
		.epilogue(constellationBetaWarning);
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof options>;
export const handler = withConfig<HandlerOptions>(
	async ({ name, json, config }): Promise<void> => {
		const accountId = await requireAuth(config);
		const proj: Project = await getProjectByName(config, accountId, name);

		const models = await listModels(accountId, proj);

		if (json) {
			logger.log(JSON.stringify(models, null, 2));
		} else {
			logger.log(constellationBetaWarning);
			logger.table(models);
		}
	}
);
