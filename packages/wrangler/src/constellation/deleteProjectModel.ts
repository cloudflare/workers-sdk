import { fetchResult } from "../cfetch";
import { withConfig } from "../config";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { takeName } from "./options";
import {
	constellationBetaWarning,
	getProjectByName,
	getProjectModelByName,
} from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Project, Model } from "./types";

export function options(yargs: CommonYargsArgv) {
	return takeName(yargs)
		.positional("modelName", {
			describe: "The name of the uploaded model",
			type: "string",
			demandOption: true,
		})
		.option("force", {
			describe: "Skip confirmation",
			type: "boolean",
			alias: "f",
			default: false,
		})
		.epilogue(constellationBetaWarning);
}
type HandlerOptions = StrictYargsOptionsToInterface<typeof options>;
export const handler = withConfig<HandlerOptions>(
	async ({ name, modelName, force, config }): Promise<void> => {
		const accountId = await requireAuth(config);
		logger.log(constellationBetaWarning);

		const proj: Project = await getProjectByName(config, accountId, name);

		const model: Model = await getProjectModelByName(
			config,
			accountId,
			proj,
			modelName
		);

		logger.log(`About to delete Model '${modelName}' (${model.id}).`);
		if (!force) {
			const response = await confirm(`Ok to proceed?`);
			if (!response) {
				logger.log(`Not deleting.`);
				return;
			}

			logger.log("Deleting...");
		}

		await fetchResult(
			`/accounts/${accountId}/constellation/project/${proj.id}/model/${model.id}`,
			{
				method: "DELETE",
			}
		);

		logger.log(`Deleted '${modelName}' successfully.`);
	}
);
