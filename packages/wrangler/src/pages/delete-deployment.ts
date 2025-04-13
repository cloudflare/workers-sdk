import { fetchResult } from "../cfetch";
import { getConfigCache } from "../config-cache";
import { createCommand } from "../core/create-command";
import { COMPLIANCE_REGION_CONFIG_PUBLIC } from "../environment-variables/misc-variables";
import { FatalError } from "../errors";
import isInteractive from "../is-interactive";
import { logger } from "../logger";
import { requireAuth } from "../user";
import { PAGES_CONFIG_CACHE_FILENAME } from "./constants";
import { promptSelectProject } from "./prompt-select-project";
import type { PagesConfigCache } from "./types";

export const pagesDeploymentDeleteCommand = createCommand({
	metadata: {
		description: "Delete a Pages deployment",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
	behaviour: {
		provideConfig: false,
	},
	args: {
		deployment: {
			type: "string",
			description: "The ID of the deployment you wish to delete",
		},
		"project-name": {
			type: "string",
			description:
				"The name of the project you would like to delete the deployment from",
		},
	},
	positionalArgs: ["deployment"],
	async handler(args) {
		if (args.config) {
			throw new FatalError(
				"Pages does not support custom paths for the Wrangler configuration file",
				1
			);
		}

		if (args.env) {
			throw new FatalError(
				"Pages does not support targeting an environment with the --env flag. Use the --branch flag to target your production or preview branch",
				1
			);
		}

		const configCache = getConfigCache<PagesConfigCache>(
			PAGES_CONFIG_CACHE_FILENAME
		);

		const accountId = await requireAuth(configCache);

		let projectName = args.projectName;

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

		if (!args.deployment || !projectName) {
			throw new FatalError("Must specify a project name and deployment.", 1);
		}

		await fetchResult(
			COMPLIANCE_REGION_CONFIG_PUBLIC,
			`/accounts/${accountId}/pages/projects/${projectName}/deployments/${args.deployment}`,
			{ method: "DELETE" }
		);

		logger.log(`Deployment ${args.deployment} was successfully deleted.`);
	},
});
