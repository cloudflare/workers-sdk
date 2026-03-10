import { execSync } from "node:child_process";
import {
	COMPLIANCE_REGION_CONFIG_PUBLIC,
	FatalError,
} from "@cloudflare/workers-utils";
import { format as timeagoFormat } from "timeago.js";
import { fetchResult } from "../cfetch";
import { getConfigCache, saveToConfigCache } from "../config-cache";
import { createCommand } from "../core/create-command";
import { confirm, prompt } from "../dialogs";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { getCloudflareAccountIdFromEnv } from "../user/auth-variables";
import { PAGES_CONFIG_CACHE_FILENAME } from "./constants";
import type { PagesConfigCache, Project } from "./types";

export const pagesProjectListCommand = createCommand({
	metadata: {
		description: "List your Cloudflare Pages projects",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
	behaviour: {
		provideConfig: false,
		printBanner: (args) => !args.json,
	},
	args: {
		json: {
			type: "boolean",
			description: "Return output as clean JSON",
			default: false,
		},
	},
	async handler({ json }) {
		const config = getConfigCache<PagesConfigCache>(
			PAGES_CONFIG_CACHE_FILENAME
		);

		const accountId =
			getCloudflareAccountIdFromEnv() ?? (await requireAuth(config));

		const projects: Array<Project> = await listProjects({ accountId });

		const data = projects.map((project) => {
			return {
				"Project Name": project.name,
				"Project Domains": `${project.domains.join(", ")}`,
				"Git Provider": project.source ? "Yes" : "No",
				"Last Modified": project.latest_deployment
					? timeagoFormat(project.latest_deployment.modified_on)
					: timeagoFormat(project.created_on),
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
		metrics.sendMetricsEvent("list pages projects");
	},
});

export const listProjects = async ({
	accountId,
}: {
	accountId: string;
}): Promise<Array<Project>> => {
	const pageSize = 10;
	let page = 1;
	const results = [];
	while (results.length % pageSize === 0) {
		const json: Array<Project> = await fetchResult(
			COMPLIANCE_REGION_CONFIG_PUBLIC,
			`/accounts/${accountId}/pages/projects`,
			{},
			new URLSearchParams({
				per_page: pageSize.toString(),
				page: page.toString(),
			})
		);
		page++;
		results.push(...json);
		if (json.length < pageSize) {
			break;
		}
	}
	return results;
};

export const pagesProjectCreateCommand = createCommand({
	metadata: {
		description: "Create a new Cloudflare Pages project",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
	behaviour: {
		provideConfig: false,
	},
	args: {
		"project-name": {
			type: "string",
			demandOption: true,
			description: "The name of your Pages project",
		},
		"production-branch": {
			type: "string",
			description: "The name of the production branch of your project",
		},
		"compatibility-flags": {
			description: "Flags to use for compatibility checks",
			alias: "compatibility-flag",
			type: "string",
			requiresArg: true,
			array: true,
		},
		"compatibility-date": {
			description: "Date to use for compatibility checks",
			type: "string",
			requiresArg: true,
		},
	},
	positionalArgs: ["project-name"],
	async handler({
		productionBranch,
		compatibilityFlags,
		compatibilityDate,
		projectName,
	}) {
		const config = getConfigCache<PagesConfigCache>(
			PAGES_CONFIG_CACHE_FILENAME
		);
		const accountId =
			getCloudflareAccountIdFromEnv() ?? (await requireAuth(config));

		const isInteractive = process.stdin.isTTY;
		if (!projectName && isInteractive) {
			projectName = await prompt("Enter the name of your new project:");
		}

		if (!projectName) {
			throw new FatalError("Must specify a project name.", 1);
		}

		if (!productionBranch && isInteractive) {
			logger.debug(
				"pages project create: Detecting git repository for production branch suggestion..."
			);
			let isGitDir = true;
			try {
				execSync(`git rev-parse --is-inside-work-tree`, {
					stdio: "ignore",
				});
				logger.debug("pages project create: Git repository detected");
			} catch (err) {
				isGitDir = false;
				logger.debug(
					`pages project create: Not a git repository: ${err instanceof Error ? err.message : String(err)}`
				);
			}

			if (isGitDir) {
				try {
					productionBranch = execSync(`git rev-parse --abbrev-ref HEAD`)
						.toString()
						.trim();
					logger.debug(
						`pages project create: Detected branch for suggestion: "${productionBranch}"`
					);
				} catch (err) {
					logger.debug(
						`pages project create: Failed to detect branch: ${err instanceof Error ? err.message : String(err)}`
					);
				}
			}

			productionBranch = await prompt("Enter the production branch name:", {
				defaultValue: productionBranch ?? "production",
			});
		}

		if (!productionBranch) {
			throw new FatalError("Must specify a production branch.", 1);
		}

		const deploymentConfig = {
			...(compatibilityFlags && {
				compatibility_flags: [...compatibilityFlags],
			}),
			...(compatibilityDate && {
				compatibility_date: compatibilityDate,
			}),
		};

		const body: Partial<Project> = {
			name: projectName,
			production_branch: productionBranch,
			deployment_configs: {
				production: { ...deploymentConfig },
				preview: { ...deploymentConfig },
			},
		};

		const { subdomain } = await fetchResult<Project>(
			COMPLIANCE_REGION_CONFIG_PUBLIC,
			`/accounts/${accountId}/pages/projects`,
			{
				method: "POST",
				body: JSON.stringify(body),
			}
		);

		saveToConfigCache<PagesConfigCache>(PAGES_CONFIG_CACHE_FILENAME, {
			account_id: accountId,
			project_name: projectName,
		});

		logger.log(
			`✨ Successfully created the '${projectName}' project. It will be available at https://${subdomain}/ once you create your first deployment.`
		);
		logger.log(
			`To deploy a folder of assets, run 'wrangler pages deploy [directory]'.`
		);
		metrics.sendMetricsEvent("create pages project");
	},
});

export const pagesProjectDeleteCommand = createCommand({
	metadata: {
		description: "Delete a Cloudflare Pages project",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
	behaviour: {
		provideConfig: false,
	},
	args: {
		"project-name": {
			type: "string",
			description: "The name of your Pages project",
			demandOption: true,
		},
		yes: {
			alias: "y",
			type: "boolean",
			description: 'Answer "yes" to confirm project deletion',
		},
	},
	positionalArgs: ["project-name"],
	async handler(args) {
		const config = getConfigCache<PagesConfigCache>(
			PAGES_CONFIG_CACHE_FILENAME
		);
		const accountId =
			getCloudflareAccountIdFromEnv() ?? (await requireAuth(config));

		const confirmed =
			args.yes ||
			(await confirm(
				`Are you sure you want to delete "${args.projectName}"? This action cannot be undone.`
			));

		if (confirmed) {
			logger.log("Deleting", args.projectName);
			await fetchResult(
				COMPLIANCE_REGION_CONFIG_PUBLIC,
				`/accounts/${accountId}/pages/projects/${args.projectName}`,
				{ method: "DELETE" }
			);

			logger.log("Successfully deleted", args.projectName);
		}
	},
});
