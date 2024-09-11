import { execSync } from "node:child_process";
import { render, Text } from "ink";
import SelectInput from "ink-select-input";
import { deploy } from "../api/pages/deploy";
import { fetchResult } from "../cfetch";
import { findWranglerToml, readConfig } from "../config";
import { getConfigCache, saveToConfigCache } from "../config-cache";
import { prompt } from "../dialogs";
import { FatalError } from "../errors";
import { logger } from "../logger";
import * as metrics from "../metrics";
import { writeOutput } from "../output";
import { requireAuth } from "../user";
import {
	MAX_DEPLOYMENT_STATUS_ATTEMPTS,
	PAGES_CONFIG_CACHE_FILENAME,
} from "./constants";
import { EXIT_CODE_INVALID_PAGES_CONFIG } from "./errors";
import { listProjects } from "./projects";
import { promptSelectProject } from "./prompt-select-project";
import type { Config } from "../config";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { PagesConfigCache } from "./types";
import type {
	Deployment,
	DeploymentStage,
	Project,
	UnifiedDeploymentLogMessages,
} from "@cloudflare/types";

type PagesDeployArgs = StrictYargsOptionsToInterface<typeof Options>;

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
			"upload-source-maps": {
				type: "boolean",
				default: false,
				description:
					"Whether to upload any server-side sourcemaps with this deployment",
			},
		});
}

export const Handler = async (args: PagesDeployArgs) => {
	let { branch, commitHash, commitMessage, commitDirty } = args;

	// Check for deprecated `wrangler pages publish` command
	if (args._[1] === "publish") {
		logger.warn(
			"`wrangler pages publish` is deprecated and will be removed in the next major version.\nPlease use `wrangler pages deploy` instead, which accepts exactly the same arguments."
		);
	}

	if (args.config) {
		throw new FatalError(
			"Pages does not support custom paths for the `wrangler.toml` configuration file",
			1
		);
	}

	if (args.experimentalJsonConfig) {
		throw new FatalError("Pages does not support `wrangler.json`", 1);
	}

	if (args.env) {
		throw new FatalError(
			"Pages does not support targeting an environment with the --env flag. Use the --branch flag to target your production or preview branch",
			1
		);
	}

	let config: Config | undefined;
	const configPath = findWranglerToml(process.cwd(), false);

	try {
		/*
		 * this reads the config file with `env` set to `undefined`, which will
		 * return the top-level config. This contains all the information we
		 * need for now. We will perform a second config file read later
		 * in `/api/pages/deploy`, that will get the environment specific config
		 */
		config = readConfig(configPath, { ...args, env: undefined }, true);
	} catch (err) {
		if (
			!(
				err instanceof FatalError && err.code === EXIT_CODE_INVALID_PAGES_CONFIG
			)
		) {
			throw err;
		}
	}

	/*
	 * If we found a `wrangler.toml` config file that doesn't specify
	 * `pages_build_output_dir`, we'll ignore the file, but inform users
	 * that we did find one, just not valid for Pages.
	 */
	if (configPath && config === undefined) {
		logger.warn(
			`Pages now has wrangler.toml support.\n` +
				`We detected a configuration file at ${configPath} but it is missing the "pages_build_output_dir" field, required by Pages.\n` +
				`If you would like to use this configuration file to deploy your project, please use "pages_build_output_dir" to specify the directory of static files to upload.\n` +
				`Ignoring configuration file for now, and proceeding with project deploy.`
		);
	}

	const directory = args.directory ?? config?.pages_build_output_dir;
	if (!directory) {
		throw new FatalError(
			"Must specify a directory of assets to deploy. Please specify the [<directory>] argument in the `pages deploy` command, or configure `pages_build_output_dir` in your `wrangler.toml` configuration file.",
			1
		);
	}

	const configCache = getConfigCache<PagesConfigCache>(
		PAGES_CONFIG_CACHE_FILENAME
	);
	const accountId = await requireAuth(configCache);

	let projectName =
		args.projectName ?? config?.name ?? configCache.project_name;
	let isExistingProject = true;

	if (projectName) {
		try {
			await fetchResult<Project>(
				`/accounts/${accountId}/pages/projects/${projectName}`
			);
		} catch (err) {
			// code `8000007` corresponds to project not found
			if ((err as { code: number }).code !== 8000007) {
				throw err;
			} else {
				isExistingProject = false;
			}
		}
	}

	const isInteractive = process.stdin.isTTY;
	if ((!projectName || !isExistingProject) && isInteractive) {
		let existingOrNew: "existing" | "new" = "new";

		/*
		 * if no project name was specified, we should give users the option
		 * of creating a new project, or selecting an existing one, if any are
		 * associated with their `accountId`
		 */
		if (!projectName) {
			// get projects that are not connected to an SCM source (GitHub/GitLab)
			// aka direct-upload projects
			const duProjects = (await listProjects({ accountId })).filter(
				(project) => !project.source
			);

			if (duProjects.length > 0) {
				const message =
					"No project specified. Would you like to create one or use an existing project?";
				const items: NewOrExistingItem[] = [
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
				];

				existingOrNew = await promptSelectExistingOrNewProject(message, items);
			}
		}

		/*
		 * if project name was specified, but no project with that name is
		 * associated with their `accountId`, we should offer users the option
		 * to create that project for them
		 */
		if (projectName !== undefined && !isExistingProject) {
			const message = `The project you specified does not exist: "${projectName}". Would you like to create it?`;
			const items: NewOrExistingItem[] = [
				{
					key: "new",
					label: "Create a new project",
					value: "new",
				},
			];
			existingOrNew = await promptSelectExistingOrNewProject(message, items);
		}

		switch (existingOrNew) {
			case "existing": {
				projectName = await promptSelectProject({ accountId });
				break;
			}
			case "new": {
				if (!projectName) {
					projectName = await prompt("Enter the name of your new project:");

					if (!projectName) {
						throw new FatalError("Must specify a project name.", 1);
					}
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

	const deploymentResponse = await deploy({
		directory,
		accountId,
		projectName,
		branch,
		commitMessage,
		commitHash,
		commitDirty,
		skipCaching: args.skipCaching,
		// TODO: Here lies a known bug. If you specify both `--bundle` and `--no-bundle`, this behavior is undefined and you will get unexpected results.
		// There is no sane way to get the true value out of yargs, so here we are.
		bundle: args.bundle ?? !args.noBundle,
		// Sourcemaps from deploy arguments will take precedence so people can try it for one-off deployments without updating their wrangler.toml
		sourceMaps: config?.upload_source_maps || args.uploadSourceMaps,
		args,
	});

	saveToConfigCache<PagesConfigCache>(PAGES_CONFIG_CACHE_FILENAME, {
		account_id: accountId,
		project_name: projectName,
	});

	let latestDeploymentStage: DeploymentStage | undefined;
	let attempts = 0;

	logger.log("🌎 Deploying...");

	while (
		attempts < MAX_DEPLOYMENT_STATUS_ATTEMPTS &&
		latestDeploymentStage?.name !== "deploy" &&
		latestDeploymentStage?.status !== "success" &&
		latestDeploymentStage?.status !== "failure"
	) {
		try {
			/*
			 * Exponential backoff
			 * On every retry, exponentially increase the wait time: 1 second, then
			 * 2s, then 4s, then 8s, etc.
			 */
			await new Promise((resolvePromise) =>
				setTimeout(resolvePromise, Math.pow(2, attempts++) * 1000)
			);

			logger.debug(
				`attempt #${attempts}: Attempting to fetch status for deployment with id "${deploymentResponse.id}" ...`
			);

			const deployment = await fetchResult<Deployment>(
				`/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentResponse.id}`
			);
			latestDeploymentStage = deployment.latest_stage;
		} catch (err) {
			// don't retry if API call retruned an error
			logger.debug(
				`Attempt to get deployment status for deployment with id "${deploymentResponse.id}" failed: ${err}`
			);
		}
	}

	if (
		latestDeploymentStage?.name === "deploy" &&
		latestDeploymentStage?.status === "success"
	) {
		logger.log(
			`✨ Deployment complete! Take a peek over at ${deploymentResponse.url}`
		);
	} else if (
		latestDeploymentStage?.name === "deploy" &&
		latestDeploymentStage?.status === "failure"
	) {
		// get persistent logs so we can show users the failure message
		const logs = await fetchResult<UnifiedDeploymentLogMessages>(
			`/accounts/${accountId}/pages/projects/${projectName}/deployments/${deploymentResponse.id}/history/logs?size=10000000`
		);
		// last log entry will be the most relevant for Direct Uploads
		const failureMessage = logs.data[logs.total - 1].line
			.replace("Error:", "")
			.trim();

		throw new FatalError(
			`Deployment failed!
${failureMessage}`,
			1
		);
	} else {
		logger.log(
			`✨ Deployment complete! However, we couldn't ascertain the final status of your deployment.\n\n` +
				`⚡️ Visit your deployment at ${deploymentResponse.url}\n` +
				`⚡️ Check the deployment details on the Cloudflare dashboard: https://dash.cloudflare.com/${accountId}/pages/view/${projectName}/${deploymentResponse.id}`
		);
	}

	writeOutput({
		type: "pages-deploy",
		version: 1,
		pages_project: deploymentResponse.project_name,
		deployment_id: deploymentResponse.id,
		url: deploymentResponse.url,
	});

	await metrics.sendMetricsEvent("create pages deployment");
};

type NewOrExistingItem = {
	key: string;
	label: string;
	value: "new" | "existing";
};

function promptSelectExistingOrNewProject(
	message: string,
	items: NewOrExistingItem[]
): Promise<"new" | "existing"> {
	return new Promise<"new" | "existing">((resolve) => {
		const { unmount } = render(
			<>
				<Text>{message}</Text>
				<SelectInput
					items={items}
					onSelect={async (selected) => {
						resolve(selected.value as "new" | "existing");
						unmount();
					}}
				/>
			</>
		);
	});
}
