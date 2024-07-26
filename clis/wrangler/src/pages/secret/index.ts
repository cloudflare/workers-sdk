import path from "node:path";
import readline from "node:readline";
import chalk from "chalk";
import { fetchResult } from "../../cfetch";
import { findWranglerToml, readConfig } from "../../config";
import { getConfigCache } from "../../config-cache";
import { confirm, prompt } from "../../dialogs";
import { FatalError } from "../../errors";
import { printWranglerBanner } from "../../index";
import isInteractive from "../../is-interactive";
import { logger } from "../../logger";
import * as metrics from "../../metrics";
import { parseJSON, readFileSync } from "../../parse";
import { requireAuth } from "../../user";
import { readFromStdin, trimTrailingWhitespace } from "../../utils/std";
import { PAGES_CONFIG_CACHE_FILENAME } from "../constants";
import { EXIT_CODE_INVALID_PAGES_CONFIG } from "../errors";
import type { Config } from "../../config";
import type { CommonYargsArgv, SubHelp } from "../../yargs-types";
import type { PagesProject } from "../download-config";
import type { PagesConfigCache } from "../types";

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
	const configPath = findWranglerToml(process.cwd(), false);

	try {
		/*
		 * this reads the config file with `env` set to `undefined`, which will
		 * return the top-level config. This contains all the information we
		 * need.
		 */
		config = readConfig(
			configPath,
			{ env: undefined, experimentalJsonConfig: false },
			true
		);
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

export const secret = (secretYargs: CommonYargsArgv, subHelp: SubHelp) => {
	return secretYargs
		.command(subHelp)
		.command(
			"put <key>",
			"Create or update a secret variable for a Pages project",
			(yargs) => {
				return yargs
					.positional("key", {
						describe: "The variable name to be accessible in the Pages project",
						type: "string",
					})
					.option("project-name", {
						type: "string",
						alias: ["project"],
						description: "The name of your Pages project",
					});
			},
			async (args) => {
				await printWranglerBanner();
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

				await metrics.sendMetricsEvent("create pages encrypted variable", {
					sendMetrics: config?.send_metrics,
				});

				logger.log(`✨ Success! Uploaded secret ${args.key}`);
			}
		)
		.command(
			"bulk [json]",
			"Bulk upload secrets for a Pages project",
			(yargs) => {
				return yargs
					.positional("json", {
						describe: `The JSON file of key-value pairs to upload, in form {"key": value, ...}`,
						type: "string",
					})
					.option("project-name", {
						type: "string",
						alias: ["project"],
						description: "The name of your Pages project",
					});
			},
			async (args) => {
				await printWranglerBanner();
				const { env, project, accountId } = await pagesProject(
					args.env,
					args.projectName
				);

				logger.log(
					`🌀 Creating the secrets for the Pages project "${project.name}" (${env})`
				);

				let content: Record<string, string>;
				if (args.json) {
					const jsonFilePath = path.resolve(args.json);
					content = parseJSON<Record<string, string>>(
						readFileSync(jsonFilePath),
						jsonFilePath
					);
				} else {
					try {
						const rl = readline.createInterface({ input: process.stdin });
						let pipedInput = "";
						for await (const line of rl) {
							pipedInput += line;
						}
						content = parseJSON<Record<string, string>>(pipedInput);
					} catch {
						throw new FatalError(
							`🚨 Please provide a JSON file or valid JSON pipe`
						);
					}
				}

				if (!content) {
					throw new FatalError(
						`🚨 No content found in JSON file or piped input.`
					);
				}

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
					logger.log("Finished processing secrets JSON file:");
					logger.log(
						`✨ ${
							Object.keys(upsertBindings).length
						} secrets successfully uploaded`
					);
				} catch (err) {
					logger.log("Finished processing secrets JSON file:");
					logger.log(`✨ 0 secrets successfully uploaded`);
					throw new FatalError(
						`🚨 ${Object.keys(upsertBindings).length} secrets failed to upload`
					);
				}
			}
		)
		.command(
			"delete <key>",
			"Delete a secret variable from a Pages project",
			async (yargs) => {
				return yargs
					.positional("key", {
						describe: "The variable name to be accessible in the Pages project",
						type: "string",
					})
					.option("project-name", {
						type: "string",
						alias: ["project"],
						description: "The name of your Pages project",
					});
			},
			async (args) => {
				await printWranglerBanner();
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
					await metrics.sendMetricsEvent("delete pages encrypted variable", {
						sendMetrics: config?.send_metrics,
					});
					logger.log(`✨ Success! Deleted secret ${args.key}`);
				}
			}
		)
		.command(
			"list",
			"List all secrets for a Pages project",
			(yargs) => {
				return yargs.option("project-name", {
					type: "string",
					alias: ["project"],
					description: "The name of your Pages project",
				});
			},
			async (args) => {
				await printWranglerBanner();
				const { env, project, config } = await pagesProject(
					args.env,
					args.projectName
				);

				const secrets = Object.entries(
					project.deployment_configs[env].env_vars ?? {}
				).filter(([_, val]) => val?.type === "secret_text");

				const message = [
					`The "${chalk.blue(
						env
					)}" environment of your Pages project "${chalk.blue(
						project.name
					)}" has access to the following secrets:`,
					...secrets.map(
						([name]) => `  - ${name}: ${chalk.italic("Value Encrypted")}`
					),
				].join("\n");

				logger.log(message);

				await metrics.sendMetricsEvent("list pages encrypted variables", {
					sendMetrics: config?.send_metrics,
				});
			}
		);
};
