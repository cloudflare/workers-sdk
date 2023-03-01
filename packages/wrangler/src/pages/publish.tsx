import { execSync } from "node:child_process";
import { render, Text } from "ink";
import SelectInput from "ink-select-input";
import React from "react";
import { publish } from "../api/pages/publish";
import { fetchResult } from "../cfetch";
import { getConfigCache, saveToConfigCache } from "../config-cache";
import { prompt } from "../dialogs";
import { FatalError } from "../errors";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { requireAuth } from "../user";
import { PAGES_CONFIG_CACHE_FILENAME } from "./constants";
import { listProjects } from "./projects";
import { promptSelectProject } from "./prompt-select-project";
import { pagesBetaWarning } from "./utils";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { PagesConfigCache } from "./types";
import type { Project } from "@cloudflare/types";

type PublishArgs = StrictYargsOptionsToInterface<typeof Options>;

export function Options(yargs: CommonYargsArgv) {
	return yargs
		.positional("directory", {
			type: "string",
			demandOption: true,
			description: "The directory of static files to upload",
		})
		.options({
			"project-name": {
				type: "string",
				description: "The name of the project you want to deploy to",
			},
			branch: {
				type: "string",
				description: "The name of the branch you want to deploy to",
			},
			"commit-hash": {
				type: "string",
				description: "The SHA to attach to this deployment",
			},
			"commit-message": {
				type: "string",
				description: "The commit message to attach to this deployment",
			},
			"commit-dirty": {
				type: "boolean",
				description:
					"Whether or not the workspace should be considered dirty for this deployment",
			},
			"skip-caching": {
				type: "boolean",
				description: "Skip asset caching which speeds up builds",
			},
			bundle: {
				type: "boolean",
				default: undefined,
				hidden: true,
			},
			"no-bundle": {
				type: "boolean",
				default: false,
				description: "Whether to run bundling on `_worker.js` before deploying",
			},
			config: {
				describe: "Pages does not support wrangler.toml",
				type: "string",
				hidden: true,
			},
		})
		.epilogue(pagesBetaWarning);
}

export const Handler = async ({
	directory,
	projectName,
	branch,
	commitHash,
	commitMessage,
	commitDirty,
	skipCaching,
	bundle,
	noBundle,
	config: wranglerConfig,
}: PublishArgs) => {
	if (wranglerConfig) {
		throw new FatalError("Pages does not support wrangler.toml", 1);
	}

	if (!directory) {
		throw new FatalError("Must specify a directory.", 1);
	}

	const config = getConfigCache<PagesConfigCache>(PAGES_CONFIG_CACHE_FILENAME);
	const accountId = await requireAuth(config);

	projectName ??= config.project_name;

	const isInteractive = process.stdin.isTTY;
	if (!projectName && isInteractive) {
		const projects = (await listProjects({ accountId })).filter(
			(project) => !project.source
		);

		let existingOrNew: "existing" | "new" = "new";

		if (projects.length > 0) {
			existingOrNew = await new Promise<"new" | "existing">((resolve) => {
				const { unmount } = render(
					<>
						<Text>
							No project selected. Would you like to create one or use an
							existing project?
						</Text>
						<SelectInput
							items={[
								{
									key: "new",
									label: "Create a new project",
									value: "new",
								},
								{
									key: "existing",
									label: "Use an existing project",
									value: "existing",
								},
							]}
							onSelect={async (selected) => {
								resolve(selected.value as "new" | "existing");
								unmount();
							}}
						/>
					</>
				);
			});
		}

		switch (existingOrNew) {
			case "existing": {
				projectName = await promptSelectProject({ accountId });
				break;
			}
			case "new": {
				projectName = await prompt("Enter the name of your new project:");

				if (!projectName) {
					throw new FatalError("Must specify a project name.", 1);
				}

				let isGitDir = true;
				try {
					execSync(`git rev-parse --is-inside-work-tree`, {
						stdio: "ignore",
					});
				} catch (err) {
					isGitDir = false;
				}

				const productionBranch = await prompt(
					"Enter the production branch name:",
					{
						defaultValue: isGitDir
							? execSync(`git rev-parse --abbrev-ref HEAD`).toString().trim()
							: "production",
					}
				);

				if (!productionBranch) {
					throw new FatalError("Must specify a production branch.", 1);
				}

				await fetchResult<Project>(`/accounts/${accountId}/pages/projects`, {
					method: "POST",
					body: JSON.stringify({
						name: projectName,
						production_branch: productionBranch,
					}),
				});

				saveToConfigCache<PagesConfigCache>(PAGES_CONFIG_CACHE_FILENAME, {
					account_id: accountId,
					project_name: projectName,
				});

				logger.log(`✨ Successfully created the '${projectName}' project.`);
				await metrics.sendMetricsEvent("create pages project");
				break;
			}
		}
	}

	if (!projectName) {
		throw new FatalError("Must specify a project name.", 1);
	}

	// We infer git info by default is not passed in
	let isGitDir = true;
	try {
		execSync(`git rev-parse --is-inside-work-tree`, {
			stdio: "ignore",
		});
	} catch (err) {
		isGitDir = false;
	}

	let isGitDirty = false;

	if (isGitDir) {
		try {
			isGitDirty = Boolean(
				execSync(`git status --porcelain`).toString().length
			);

			if (!branch) {
				branch = execSync(`git rev-parse --abbrev-ref HEAD`).toString().trim();
			}

			if (!commitHash) {
				commitHash = execSync(`git rev-parse HEAD`).toString().trim();
			}

			if (!commitMessage) {
				commitMessage = execSync(`git show -s --format=%B ${commitHash}`)
					.toString()
					.trim();
			}
		} catch (err) {}

		if (isGitDirty && !commitDirty) {
			logger.warn(
				`Warning: Your working directory is a git repo and has uncommitted changes\nTo silence this warning, pass in --commit-dirty=true`
			);
		}

		if (commitDirty === undefined) {
			commitDirty = isGitDirty;
		}
	}

	const deploymentResponse = await publish({
		directory,
		accountId,
		projectName,
		branch,
		skipCaching,
		commitMessage,
		commitHash,
		commitDirty,
		// TODO: Here lies a known bug. If you specify both `--bundle` and `--no-bundle`, this behavior is undefined and you will get unexpected results.
		// There is no sane way to get the true value out of yargs, so here we are.
		bundle: bundle ?? !noBundle,
	});

	saveToConfigCache<PagesConfigCache>(PAGES_CONFIG_CACHE_FILENAME, {
		account_id: accountId,
		project_name: projectName,
	});

	logger.log(
		`✨ Deployment complete! Take a peek over at ${deploymentResponse.url}`
	);
	await metrics.sendMetricsEvent("create pages deployment");
};
