import {
	COMPLIANCE_REGION_CONFIG_PUBLIC,
	FatalError,
} from "@cloudflare/workers-utils";
import { format as timeagoFormat } from "timeago.js";
import { fetchResult } from "../../cfetch";
import { getConfigCache, saveToConfigCache } from "../../config-cache";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import * as metrics from "../../metrics";
import { requireAuth } from "../../user";
import { PAGES_CONFIG_CACHE_FILENAME } from "./constants";
import { promptSelectProject } from "./prompt-select-project";
import type { PagesConfigCache } from "./types";
import type { Deployment } from "@cloudflare/types";

export const pagesDeploymentListCommand = createCommand({
	metadata: {
		description: "List deployments in your Cloudflare Pages project",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
	behaviour: {
		provideConfig: false,
		printBanner: (args) => !args.json,
	},
	args: {
		"project-name": {
			type: "string",
			description:
				"The name of the project you would like to list deployments for",
		},
		environment: {
			type: "string",
			choices: ["production", "preview"],
			description: "Environment type to list deployments for",
		},
		json: {
			type: "boolean",
			description: "Return output as clean JSON",
			default: false,
		},
	},
	async handler({ projectName, environment, json }) {
		const config = getConfigCache<PagesConfigCache>(
			PAGES_CONFIG_CACHE_FILENAME
		);
		const accountId = await requireAuth(config);

		projectName ??= config.project_name;

		const isInteractive = process.stdin.isTTY;
		if (!projectName && isInteractive) {
			projectName = await promptSelectProject({ accountId });
		}

		if (!projectName) {
			throw new FatalError("Must specify a project name.", 1);
		}

		const deployments: Array<Deployment> = await fetchResult(
			COMPLIANCE_REGION_CONFIG_PUBLIC,
			`/accounts/${accountId}/pages/projects/${projectName}/deployments`,
			{},
			environment
				? new URLSearchParams({ env: environment })
				: new URLSearchParams({})
		);

		const titleCase = (word: string) =>
			word.charAt(0).toUpperCase() + word.slice(1);

		const shortSha = (sha: string) => sha.slice(0, 7);

		const getStatus = (deployment: Deployment) => {
			// Return a pretty time since timestamp if successful otherwise the status
			if (
				deployment.latest_stage.status === "success" &&
				deployment.latest_stage.ended_on
			) {
				return timeagoFormat(deployment.latest_stage.ended_on);
			}
			return titleCase(deployment.latest_stage.status);
		};

		const data = deployments.map((deployment) => {
			return {
				Id: deployment.id,
				Environment: titleCase(deployment.environment),
				Branch: deployment.deployment_trigger.metadata.branch,
				Source: shortSha(deployment.deployment_trigger.metadata.commit_hash),
				Deployment: deployment.url,
				Status: getStatus(deployment),
				// TODO: Use a url shortener
				Build: `https://dash.cloudflare.com/${accountId}/pages/view/${deployment.project_name}/${deployment.id}`,
			};
		});

		saveToConfigCache<PagesConfigCache>(PAGES_CONFIG_CACHE_FILENAME, {
			account_id: accountId,
		});

		if (json) {
			logger.log(JSON.stringify(data, null, 2));
		} else {
			logger.table(data);
		}
		metrics.sendMetricsEvent("list pages deployments");
	},
});
