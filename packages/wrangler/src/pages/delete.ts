import { fetchResult } from "../cfetch";
import { getConfigCache } from "../config-cache";
import { FatalError } from "../errors";
import isInteractive from "../is-interactive";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { PAGES_CONFIG_CACHE_FILENAME } from "./constants";
import { promptSelectProject } from "./prompt-select-project";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { PagesConfigCache } from "./types";

export function Options(yargs: CommonYargsArgv) {
	return yargs
		.positional("deployment", {
			type: "string",
			description: "The ID of the deployment you wish to delete",
		})
		.options({
			"project-name": {
				type: "string",
				description:
					"The name of the project you would like to delete the deployment from",
			},
		});
}

export async function Handler({
	deployment,
	projectName,
}: StrictYargsOptionsToInterface<typeof Options>) {
	const config = getConfigCache<PagesConfigCache>(PAGES_CONFIG_CACHE_FILENAME);
	const accountId = await requireAuth(config);

	projectName ??= config.project_name;

	if (!projectName) {
		if (isInteractive()) {
			projectName = await promptSelectProject({ accountId });
		} else {
			throw new FatalError(
				"Must specify a project name in non-interactive mode.",
				1
			);
		}
	}

	if (!deployment || !projectName) {
		throw new FatalError("Must specify a project name and deployment.", 1);
	}

	await fetchResult(
		`/accounts/${accountId}/pages/projects/${projectName}/deployments/${deployment}`,
		{ method: "DELETE" }
	);

	logger.log(`Deployment ${deployment} was successfully deleted.`);
}
