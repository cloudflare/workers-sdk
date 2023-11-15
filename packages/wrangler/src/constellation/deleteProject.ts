import { fetchResult } from "../cfetch";
import { withConfig } from "../config";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { takeName } from "./options";
import { constellationBetaWarning, getProjectByName } from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

export function options(yargs: CommonYargsArgv) {
	return takeName(yargs)
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
	async ({ name, force, config }): Promise<void> => {
		const accountId = await requireAuth(config);
		logger.log(constellationBetaWarning);

		const proj = await getProjectByName(config, accountId, name);

		logger.log(`About to delete Project '${name}' (${proj.id}).`);
		if (!force) {
			const response = await confirm(`Ok to proceed?`);
			if (!response) {
				logger.log(`Not deleting.`);
				return;
			}

			logger.log("Deleting...");
		}

		await fetchResult(
			`/accounts/${accountId}/constellation/project/${proj.id}`,
			{
				method: "DELETE",
			}
		);

		logger.log(`Deleted '${name}' successfully.`);
	}
);
