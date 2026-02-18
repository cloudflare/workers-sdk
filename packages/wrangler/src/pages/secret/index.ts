import {
	COMPLIANCE_REGION_CONFIG_PUBLIC,
	configFileName,
	FatalError,
	findWranglerConfig,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { fetchResult } from "../../cfetch";
import { readPagesConfig } from "../../config";
import { getConfigCache } from "../../config-cache";
import { createCommand, createNamespace } from "../../core/create-command";
import { confirm, prompt } from "../../dialogs";
import isInteractive from "../../is-interactive";
import { logger } from "../../logger";
import * as metrics from "../../metrics";
import { parseBulkInputToObject } from "../../secret";
import { requireAuth } from "../../user";
import { readFromStdin, trimTrailingWhitespace } from "../../utils/std";
import { PAGES_CONFIG_CACHE_FILENAME } from "../constants";
import { EXIT_CODE_INVALID_PAGES_CONFIG } from "../errors";
import type { PagesProject } from "../download-config";
import type { PagesConfigCache } from "../types";
import type { Config } from "@cloudflare/workers-utils";

function isPagesEnv(env: string): env is "production" | "preview" {
	return ["production", "preview"].includes(env);
}

async function pagesProject(
	env: string | undefined,
	cliProjectName: string | undefined
): Promise<{
	env: "production" | "preview";
	project: PagesProject;
	accountId: string;
	config: Config | undefined;
}> {
	env ??= "production";
	if (!isPagesEnv(env)) {
		throw new FatalError(
			`Pages does not support the "${env}" named environment. Please specify "production" (default) or "preview"`,
			1
		);
	}
	let config: Config | undefined;
	const { configPath } = findWranglerConfig(process.cwd());

	try {
		/*
		 * this reads the config file with `env` set to `undefined`, which will
		 * return the top-level config. This contains all the information we
		 * need.
		 */
		config = readPagesConfig({ config: configPath, env: undefined });
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
	 * If we found a Wrangler config file that doesn't specify
	 * `pages_build_output_dir`, we'll ignore the file, but inform users
	 * that we did find one, just not valid for Pages.
	 */
	if (configPath && config === undefined) {
		logger.warn(
			`Pages now has ${configFileName(configPath)} support.\n` +
				`We detected a configuration file at ${configPath} but it is missing the "pages_build_output_dir" field, required by Pages.\n` +
				`If you would like to use this configuration file for your project, please use "pages_build_output_dir" to specify the directory of static files to upload.\n` +
				`Ignoring configuration file for now.`
		);
	}

	const configCache = getConfigCache<PagesConfigCache>(
		PAGES_CONFIG_CACHE_FILENAME
	);
	const accountId = await requireAuth(configCache);

	const projectName =
		cliProjectName ?? config?.name ?? configCache.project_name;

	let project: PagesProject;

	if (projectName) {
		try {
			project = await fetchResult<PagesProject>(
				COMPLIANCE_REGION_CONFIG_PUBLIC,
				`/accounts/${accountId}/pages/projects/${projectName}`
			);
		} catch (err) {
			// code `8000007` corresponds to project not found
			if ((err as { code: number }).code === 8000007) {
				throw new FatalError(`Project "${projectName}" does not exist.`, 1);
			}
			throw err;
		}
	} else {
		throw new FatalError("Must specify a project name.", 1);
	}
	return { env, project, accountId, config };
}

export const pagesSecretNamespace = createNamespace({
	metadata: {
		description: "Generate a secret that can be referenced in a Pages project",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
});

export const pagesSecretPutCommand = createCommand({
	metadata: {
		description: "Create or update a secret variable for a Pages project",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
	behaviour: {
		provideConfig: false,
	},
	args: {
		key: {
			type: "string",
			description: "The variable name to be accessible in the Pages project",
			demandOption: true,
		},
		"project-name": {
			type: "string",
			alias: ["project"],
			description: "The name of your Pages project",
		},
	},
	positionalArgs: ["key"],
	async handler(args) {
		const { env, project, accountId, config } = await pagesProject(
			args.env,
			args.projectName
		);

		const secretValue = trimTrailingWhitespace(
			isInteractive()
				? await prompt("Enter a secret value:", { isSecret: true })
				: await readFromStdin()
		);

		logger.log(
			`🌀 Creating the secret for the Pages project "${project.name}" (${env})`
		);

		await fetchResult<PagesProject>(
			COMPLIANCE_REGION_CONFIG_PUBLIC,
			`/accounts/${accountId}/pages/projects/${project.name}`,
			{
				method: "PATCH",
				body: JSON.stringify({
					deployment_configs: {
						[env]: {
							env_vars: {
								[args.key as string]: {
									value: secretValue,
									type: "secret_text",
								},
							},
							wrangler_config_hash:
								project.deployment_configs[env].wrangler_config_hash,
						},
					},
				}),
			}
		);

		metrics.sendMetricsEvent(
			"create pages encrypted variable",
			{
				secretOperation: "single",
				secretSource: isInteractive() ? "interactive" : "stdin",
				hasEnvironment: Boolean(args.env),
			},
			{
				sendMetrics: config?.send_metrics,
			}
		);

		logger.log(`✨ Success! Uploaded secret ${args.key}`);
	},
});

export const pagesSecretBulkCommand = createCommand({
	metadata: {
		description: "Bulk upload secrets for a Pages project",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
	behaviour: {
		provideConfig: false,
	},
	args: {
		file: {
			type: "string",
			description: `The file of key-value pairs to upload, as JSON in form {"key": value, ...} or .dev.vars file in the form KEY=VALUE`,
		},
		"project-name": {
			type: "string",
			alias: ["project"],
			description: "The name of your Pages project",
		},
	},
	positionalArgs: ["file"],
	async handler(args) {
		const { env, project, accountId, config } = await pagesProject(
			args.env,
			args.projectName
		);

		logger.log(
			`🌀 Creating the secrets for the Pages project "${project.name}" (${env})`
		);
		const result = await parseBulkInputToObject(args.file);

		if (!result) {
			throw new FatalError(`🚨 No content found in file or piped input.`);
		}

		const { content, secretSource, secretFormat } = result;

		const upsertBindings = Object.fromEntries(
			Object.entries(content).map(([key, value]) => {
				return [
					key,
					{
						type: "secret_text",
						value: value,
					},
				];
			})
		);
		try {
			await fetchResult<PagesProject>(
				COMPLIANCE_REGION_CONFIG_PUBLIC,
				`/accounts/${accountId}/pages/projects/${project.name}`,
				{
					method: "PATCH",
					body: JSON.stringify({
						deployment_configs: {
							[env]: {
								env_vars: {
									...upsertBindings,
								},
								wrangler_config_hash:
									project.deployment_configs[env].wrangler_config_hash,
							},
						},
					}),
				}
			);
			logger.log("Finished processing secrets file:");
			logger.log(
				`✨ ${Object.keys(upsertBindings).length} secrets successfully uploaded`
			);
			metrics.sendMetricsEvent(
				"create pages encrypted variable",
				{
					secretOperation: "bulk",
					secretSource,
					secretFormat,
					hasEnvironment: Boolean(args.env),
				},
				{
					sendMetrics: config?.send_metrics,
				}
			);
		} catch (err) {
			logger.log(`🚨 Secrets failed to upload`);
			throw err;
		}
	},
});

export const pagesSecretDeleteCommand = createCommand({
	metadata: {
		description: "Delete a secret variable from a Pages project",
		status: "stable",
		owner: "Workers: Authoring and Testing",
		hideGlobalFlags: ["config", "env"],
	},
	behaviour: {
		provideConfig: false,
	},
	args: {
		key: {
			type: "string",
			description: "The variable name to be accessible in the Pages project",
			demandOption: true,
		},
		"project-name": {
			type: "string",
			alias: ["project"],
			description: "The name of your Pages project",
		},
	},
	positionalArgs: ["key"],

	async handler(args) {
		const { env, project, accountId, config } = await pagesProject(
			args.env,
			args.projectName
		);

		if (
			await confirm(
				`Are you sure you want to permanently delete the secret ${args.key} on the Pages project ${project.name} (${env})?`
			)
		) {
			logger.log(
				`🌀 Deleting the secret ${args.key} on the Pages project ${project.name} (${env})`
			);

			await fetchResult<PagesProject>(
				COMPLIANCE_REGION_CONFIG_PUBLIC,
				`/accounts/${accountId}/pages/projects/${project.name}`,
				{
					method: "PATCH",
					body: JSON.stringify({
						deployment_configs: {
							[env]: {
								env_vars: {
									[args.key as string]: null,
								},
								wrangler_config_hash:
									project.deployment_configs[env].wrangler_config_hash,
							},
						},
					}),
				}
			);
			metrics.sendMetricsEvent("delete pages encrypted variable", {
				sendMetrics: config?.send_metrics,
			});
			logger.log(`✨ Success! Deleted secret ${args.key}`);
		}
	},
});

export const pagesSecretListCommand = createCommand({
	metadata: {
		description: "List all secrets for a Pages project",
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
			alias: ["project"],
			description: "The name of your Pages project",
		},
	},
	async handler(args) {
		const { env, project, config } = await pagesProject(
			args.env,
			args.projectName
		);

		const secrets = Object.entries(
			project.deployment_configs[env].env_vars ?? {}
		).filter(([_, val]) => val?.type === "secret_text");

		const message = [
			`The "${chalk.blue(env)}" environment of your Pages project "${chalk.blue(
				project.name
			)}" has access to the following secrets:`,
			...secrets.map(
				([name]) => `  - ${name}: ${chalk.italic("Value Encrypted")}`
			),
		].join("\n");

		logger.log(message);

		metrics.sendMetricsEvent("list pages encrypted variables", {
			sendMetrics: config?.send_metrics,
		});
	},
});
