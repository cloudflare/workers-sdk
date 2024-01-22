import { execSync } from "node:child_process";
import Table from "ink-table";
import React from "react";
import { format as timeagoFormat } from "timeago.js";
import { fetchResult } from "../cfetch";
import { getConfigCache, saveToConfigCache } from "../config-cache";
import { confirm, prompt } from "../dialogs";
import { FatalError } from "../errors";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { renderToString } from "../utils/render";
import { PAGES_CONFIG_CACHE_FILENAME } from "./constants";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { PagesConfigCache, Project } from "./types";

export function ListOptions(yargs: CommonYargsArgv) {
	return yargs;
}

export async function ListHandler() {
	const config = getConfigCache<PagesConfigCache>(PAGES_CONFIG_CACHE_FILENAME);

	const accountId = await requireAuth(config);

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

	logger.log(renderToString(<Table data={data}></Table>));
	await metrics.sendMetricsEvent("list pages projects");
}

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

export function CreateOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("project-name", {
			type: "string",
			demandOption: true,
			description: "The name of your Pages project",
		})
		.options({
			"production-branch": {
				type: "string",
				description: "The name of the production branch of your project",
			},
			"compatibility-flags": {
				describe: "Flags to use for compatibility checks",
				alias: "compatibility-flag",
				type: "string",
				requiresArg: true,
				array: true,
			},
			"compatibility-date": {
				describe: "Date to use for compatibility checks",
				type: "string",
				requiresArg: true,
			},
		});
}

export async function CreateHandler({
	productionBranch,
	compatibilityFlags,
	compatibilityDate,
	projectName,
}: StrictYargsOptionsToInterface<typeof CreateOptions>) {
	const config = getConfigCache<PagesConfigCache>(PAGES_CONFIG_CACHE_FILENAME);
	const accountId = await requireAuth(config);

	const isInteractive = process.stdin.isTTY;
	if (!projectName && isInteractive) {
		projectName = await prompt("Enter the name of your new project:");
	}

	if (!projectName) {
		throw new FatalError("Must specify a project name.", 1);
	}

	if (!productionBranch && isInteractive) {
		let isGitDir = true;
		try {
			execSync(`git rev-parse --is-inside-work-tree`, {
				stdio: "ignore",
			});
		} catch (err) {
			isGitDir = false;
		}

		if (isGitDir) {
			try {
				productionBranch = execSync(`git rev-parse --abbrev-ref HEAD`)
					.toString()
					.trim();
			} catch (err) {}
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
	await metrics.sendMetricsEvent("create pages project");
}

export function DeleteOptions(yargs: CommonYargsArgv) {
	return yargs
		.positional("project-name", {
			type: "string",
			demandOption: true,
			description: "The name of your Pages project",
		})
		.options({
			yes: {
				alias: "y",
				type: "boolean",
				description: 'Answer "yes" to confirm project deletion',
			},
		});
}

export async function DeleteHandler(
	args: StrictYargsOptionsToInterface<typeof DeleteOptions>
) {
	const config = getConfigCache<PagesConfigCache>(PAGES_CONFIG_CACHE_FILENAME);
	const accountId = await requireAuth(config);

	const confirmed =
		args.yes ||
		(await confirm(
			`Are you sure you want to delete "${args.projectName}"? This action cannot be undone.`
		));

	if (confirmed) {
		logger.log("Deleting", args.projectName);
		await fetchResult(
			`/accounts/${accountId}/pages/projects/${args.projectName}`,
			{ method: "DELETE" }
		);

		logger.log("Successfully deleted", args.projectName);
	}
}
