import { fetchResult } from "../cfetch";
import { withConfig } from "../config";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import {
	constellationBetaWarning,
	getProjectByName,
	getProjectModelByName,
} from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Model, Project } from "./types";

export function options(yargs: CommonYargsArgv) {
	return yargs
		.positional("projectName", {
			describe: "The name of the project",
			type: "string",
			demandOption: true,
		})
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
	async ({ projectName, modelName, force, config }): Promise<void> => {
		const accountId = await requireAuth(config);
		logger.log(constellationBetaWarning);

		const proj: Project = await getProjectByName(
			config,
			accountId,
			projectName
		);

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
