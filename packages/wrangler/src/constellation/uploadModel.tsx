import { readFileSync } from "node:fs";
import { FormData, File } from "undici";
import { fetchResult } from "../cfetch";
import { withConfig } from "../config";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { takeName } from "./options";
import { constellationBetaWarning, getProjectByName } from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { Model } from "./types";

export function options(yargs: CommonYargsArgv) {
	return takeName(yargs)
		.positional("modelName", {
			describe: "The name of the uploaded model",
			type: "string",
			demandOption: true,
		})
		.positional("modelFile", {
			describe: "The name of the local file with the model contents",
			type: "string",
			demandOption: true,
		})
		.epilogue(constellationBetaWarning);
}
type HandlerOptions = StrictYargsOptionsToInterface<typeof options>;
export const handler = withConfig<HandlerOptions>(
	async ({ name, modelName, modelFile, config }): Promise<void> => {
		const accountId = await requireAuth(config);
		logger.log(constellationBetaWarning);

		const proj = await getProjectByName(config, accountId, name);

		const formData = new FormData();
		formData.set(
			"file",
			new File([readFileSync(modelFile)], modelFile, {
				type: "application/octet-stream",
			})
		);
		formData.set("name", modelName);

		let model: Model;
		try {
			model = await fetchResult(
				`/accounts/${accountId}/constellation/project/${proj.id}/model`,
				{
					method: "POST",
					body: formData,
				}
			);
		} catch (e) {
			if ((e as { code: number }).code === 7408) {
				throw new Error("A model with that name already exists");
			}
			throw e;
		}

		logger.log(`✅ Successfully uploaded Model "${model.name}"!`);
	}
);
