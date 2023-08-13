import { withConfig } from "../config";
import { logger } from "../logger";
import { requireAuth } from "../user";
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
	return yargs
		.positional("projectName", {
			describe: "The name of the project",
			type: "string",
			demandOption: true,
		})
		.option("json", {
			describe: "return output as clean JSON",
			type: "boolean",
			default: false,
		})
		.epilogue(constellationBetaWarning);
}

type HandlerOptions = StrictYargsOptionsToInterface<typeof options>;
export const handler = withConfig<HandlerOptions>(
	async ({ projectName, json, config }): Promise<void> => {
		const accountId = await requireAuth(config);
		const proj: Project = await getProjectByName(
			config,
			accountId,
			projectName
		);

		const models = await listModels(accountId, proj);

		if (json) {
			logger.log(JSON.stringify(models, null, 2));
		} else {
			logger.log(constellationBetaWarning);
			logger.table(models);
		}
	}
);
