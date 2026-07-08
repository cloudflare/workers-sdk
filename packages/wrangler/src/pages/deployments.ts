import { randomBytes } from "node:crypto";
import {
	COMPLIANCE_REGION_CONFIG_PUBLIC,
	UserError,
} from "@cloudflare/workers-utils";
import { format as timeagoFormat } from "timeago.js";
import { fetchResult } from "../cfetch";
import { getConfigCache, saveToConfigCache } from "../config-cache";
import { createCommand } from "../core/create-command";
import { confirm, prompt } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { getCloudflareAccountIdFromEnv } from "../user/auth-variables";
import { PAGES_CONFIG_CACHE_FILENAME } from "./constants";
import { promptSelectProject } from "./prompt-select-project";
import type { PagesConfigCache } from "./types";
import type { Deployment } from "@cloudflare/types";

function generateDeleteConfirmationCode() {
	const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	return Array.from(
		randomBytes(6),
		(byte) => letters[byte % letters.length]
	).join("");
}

async function confirmDeleteDeployments({
	deploymentIds,
	projectName,
	force,
	yes,
}: {
	deploymentIds: string[];
	projectName: string;
	force: boolean;
	yes: boolean;
}) {
	if (force || yes) {
		return true;
	}

	if (deploymentIds.length === 1) {
		return confirm(
			`Are you sure you want to delete deployment "${deploymentIds[0]}" in project "${projectName}"? This action cannot be undone.`,
			{ fallbackValue: false }
		);
	}

	if (isNonInteractiveOrCI()) {
		throw new UserError(
			"The --yes or --force flag is required to delete multiple Pages deployments in non-interactive mode.",
			{
				telemetryMessage:
					"pages deployments bulk delete non-interactive force required",
			}
		);
	}

	const confirmationCode = generateDeleteConfirmationCode();
	const enteredCode = await prompt(
		`You are about to delete ${deploymentIds.length} deployments in project "${projectName}": ${deploymentIds.join(", ")}. Type "${confirmationCode}" to confirm.`
	);

	if (enteredCode === confirmationCode) {
		return true;
	}

	logger.log("Confirmation code did not match. Skipping delete.");
	return false;
}

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
			description: "Return output as JSON",
			default: false,
		},
	},
	async handler({ projectName, environment, json }) {
		const config = getConfigCache<PagesConfigCache>(
			PAGES_CONFIG_CACHE_FILENAME
		);
		const envAccountId = getCloudflareAccountIdFromEnv();
		const accountId = await requireAuth({
			...config,
			...(envAccountId ? { account_id: envAccountId } : {}),
		});

		projectName ??= config.project_name;

		const isInteractive = process.stdin.isTTY;
		if (!projectName && isInteractive) {
			projectName = await promptSelectProject({ accountId });
		}

		if (!projectName) {
			throw new UserError(
				"Missing Pages project name. Use --project-name <name> to specify which project to list deployments for.",
				{ telemetryMessage: "pages deployments list missing project name" }
			);
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

export const pagesDeploymentDeleteCommand = createCommand({
	metadata: {
		description:
			"Delete one or more deployments in your Cloudflare Pages project",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
	behaviour: {
		provideConfig: false,
	},
	args: {
		"deployment-id": {
			type: "string",
			array: true,
			description:
				"The ID of the deployment to delete. Specify multiple IDs to delete them in bulk",
			demandOption: true,
		},
		"project-name": {
			type: "string",
			description: "The name of the project the deployment belongs to",
		},
		force: {
			type: "boolean",
			alias: "f",
			description:
				"Delete even if the deployment has an active alias. Also skips confirmation",
			default: false,
		},
		yes: {
			type: "boolean",
			alias: "y",
			description: "Skip confirmation without forcing aliased deployments",
			default: false,
		},
	},
	positionalArgs: ["deployment-id"],
	async handler({ deploymentId, projectName, force, yes }) {
		const deploymentIds = Array.isArray(deploymentId)
			? deploymentId
			: [deploymentId];
		const config = getConfigCache<PagesConfigCache>(
			PAGES_CONFIG_CACHE_FILENAME
		);
		const envAccountId = getCloudflareAccountIdFromEnv();
		const accountId = await requireAuth({
			...config,
			...(envAccountId ? { account_id: envAccountId } : {}),
		});

		projectName ??= config.project_name;

		const isInteractive = !isNonInteractiveOrCI();
		if (!projectName && isInteractive) {
			projectName = await promptSelectProject({ accountId });
		}

		if (!projectName) {
			throw new UserError(
				"Missing Pages project name. Use --project-name <name> to specify which project to delete the deployment from.",
				{
					telemetryMessage: "pages deployments delete missing project name",
				}
			);
		}

		const confirmed = await confirmDeleteDeployments({
			deploymentIds,
			projectName,
			force,
			yes,
		});

		if (!confirmed) {
			return;
		}

		const deploymentCount = deploymentIds.length;
		logger.log(
			deploymentCount === 1
				? `Deleting deployment ${deploymentIds[0]}...`
				: `Deleting ${deploymentCount} deployments...`
		);

		for (const currentDeploymentId of deploymentIds) {
			if (deploymentCount > 1) {
				logger.log(`Deleting deployment ${currentDeploymentId}...`);
			}
			await fetchResult(
				COMPLIANCE_REGION_CONFIG_PUBLIC,
				`/accounts/${accountId}/pages/projects/${projectName}/deployments/${currentDeploymentId}`,
				{ method: "DELETE" },
				new URLSearchParams({ force: force.toString() })
			);
			if (deploymentCount > 1) {
				logger.log(`Deleted deployment ${currentDeploymentId}`);
			}
		}

		saveToConfigCache<PagesConfigCache>(PAGES_CONFIG_CACHE_FILENAME, {
			account_id: accountId,
			project_name: projectName,
		});

		logger.log(
			deploymentCount === 1
				? `Successfully deleted deployment ${deploymentIds[0]}`
				: `Successfully deleted ${deploymentCount} deployments`
		);
		metrics.sendMetricsEvent("delete pages deployment");
	},
});
