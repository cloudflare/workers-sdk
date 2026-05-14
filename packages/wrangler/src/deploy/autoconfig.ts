import assert from "node:assert";
import { statSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "@cloudflare/cli-shared-helpers/command";
import {
	configFileName,
	getOpenNextDeployFromEnv,
	getTodaysCompatDate,
	UserError,
	type Config,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { getDetailsForAutoConfig } from "../autoconfig/details";
import { getInstalledPackageVersion } from "../autoconfig/frameworks/utils/packages";
import { runAutoConfig } from "../autoconfig/run";
import {
	sendAutoConfigProcessEndedMetricsEvent,
	sendAutoConfigProcessStartedMetricsEvent,
} from "../autoconfig/telemetry-utils";
import { readConfig } from "../config";
import { confirm, prompt } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { writeOutput } from "../output";
import { getPackageManager } from "../package-manager";
import { type DeployArgs } from ".";

/**
 * Runs autoconfig if applicable, including the pages_build_output_dir guard and
 * open-next delegation. Returns `{ aborted: true }` if deploy should not proceed
 * (user declined or delegated to open-next), otherwise returns the
 * potentially-updated config.
 */
export async function maybeRunAutoConfig(
	args: DeployArgs,
	config: Config
): Promise<{ config: Config; aborted: boolean }> {
	const shouldRunAutoConfig =
		args.experimentalAutoconfig &&
		// If there is a positional parameter, an assets directory specified via --assets, or an
		// explicit --config path then we don't want to run autoconfig since we assume that the
		// user knows what they are doing and that they are specifying what needs to be deployed
		!args.script &&
		!args.assets &&
		!args.config;

	if (shouldRunAutoConfig) {
		sendAutoConfigProcessStartedMetricsEvent({
			command: "wrangler deploy",
			dryRun: !!args.dryRun,
		});

		try {
			const details = await getDetailsForAutoConfig({
				wranglerConfig: config,
			});

			if (details.framework?.id === "cloudflare-pages") {
				// If the project is a Pages project then warn the user but allow them to proceed if they wish so
				logger.warn(
					"It seems that you have run `wrangler deploy` on a Pages project, `wrangler pages deploy` should be used instead. Proceeding will likely produce unwanted results."
				);
				const proceedWithPagesProject = await confirm(
					"Are you sure that you want to proceed?",
					{
						defaultValue: false,
						fallbackValue: true,
					}
				);

				if (!proceedWithPagesProject) {
					sendAutoConfigProcessEndedMetricsEvent({
						success: false,
						command: "wrangler deploy",
						dryRun: !!args.dryRun,
					});
					return { config, aborted: true };
				}
			} else if (!details.configured) {
				// Only run auto config if the project is not already configured
				const autoConfigSummary = await runAutoConfig(details);

				writeOutput({
					type: "autoconfig",
					version: 1,
					command: "deploy",
					summary: autoConfigSummary,
				});

				// If autoconfig worked, there should now be a new config file, and so we need to read config again
				config = readConfig(args, {
					hideWarnings: false,
					useRedirectIfAvailable: true,
				});
			}
		} catch (error) {
			sendAutoConfigProcessEndedMetricsEvent({
				command: "wrangler deploy",
				dryRun: !!args.dryRun,
				success: false,
				error,
			});
			throw error;
		}

		sendAutoConfigProcessEndedMetricsEvent({
			success: true,
			command: "wrangler deploy",
			dryRun: !!args.dryRun,
		});
	}

	// Note: the open-next delegation should happen after we run the auto-config logic so that we
	//       make sure that the deployment of brand newly auto-configured Next.js apps is correctly
	//       delegated here
	const deploymentDelegatedToOpenNext =
		// Currently the delegation to open-next is gated behind the autoconfig experimental flag, this is because
		// this behavior is currently only necessary in the autoconfig flow and having it un-gated/stable in wrangler
		// releases caused different issues. All the issues should have been fixed (by
		// https://github.com/cloudflare/workers-sdk/pull/11694 and https://github.com/cloudflare/workers-sdk/pull/11710)
		// but as a precaution we're gating the feature under the autoconfig flag for the time being
		args.experimentalAutoconfig &&
		// If the user explicitly provided a --config path, they are targeting a specific Worker config and we should not delegate to open-next
		!args.config &&
		!args.dryRun &&
		(await maybeDelegateToOpenNextDeployCommand(process.cwd()));

	if (deploymentDelegatedToOpenNext) {
		return { config, aborted: true };
	}

	return { config, aborted: false };
} /**
 * Interactively prompts for missing deploy configuration. Handles two phases:
 *
 * 1. If the positional `script` arg is a directory and no config file exists,
 *    asks whether the user intends to deploy static assets.
 * 2. Prompts for missing name and compatibility date, and optionally writes a
 *    new wrangler.jsonc config file.
 *
 * No-op in non-interactive / CI environments.
 */

export async function promptForMissingConfig(
	args: DeployArgs,
	config: { configPath?: string; compatibility_date?: string; name?: string }
): Promise<DeployArgs> {
	// Phase 1: detect `wrangler deploy <directory>` and offer to treat it as assets
	let scriptIsDirectory = false;
	if (!config.configPath && args.script) {
		try {
			const stats = statSync(args.script);
			if (stats.isDirectory()) {
				scriptIsDirectory = true;
				args = await promptForMissingAssetFlag(args.script, args);
			}
		} catch (error) {
			// If this is our UserError, re-throw it
			if (error instanceof UserError) {
				throw error;
			}
			// If stat fails, let the original flow handle the error
		}
	}

	// Phase 2: prompt for name / compat-date / config file.
	// Skip when the user was offered an assets deployment and declined (script is still a directory) —
	// getEntry will produce the appropriate error about the directory entry point.
	if (scriptIsDirectory && !args.assets) {
		return args;
	}

	return promptForMissingDeployConfig(args, config);
} /**
 * Handles the case where a user provides a directory as a positional argument,
 * probably intending to deploy static assets. e.g. `wrangler deploy ./public`.
 * If the user confirms, sets `args.assets` and clears `args.script`.
 */

export async function promptForMissingAssetFlag(
	assetDirectory: string,
	args: DeployArgs
): Promise<DeployArgs> {
	if (isNonInteractiveOrCI()) {
		return args;
	}

	// Ask if user intended to deploy assets only
	logger.log("");
	if (!args.assets) {
		const deployAssets = await confirm(
			"It looks like you are trying to deploy a directory of static assets only. Is this correct?",
			{ defaultValue: true }
		);
		logger.log("");
		if (deployAssets) {
			args.assets = assetDirectory;
			args.script = undefined;
		} else {
			// let the usual error handling path kick in
			return args;
		}
	}

	return args;
}

/**
 * Interactively prompts for missing deployment configuration (name, compatibility date,
 * and optionally config file writing when no config file exists).
 * No-op in non-interactive/CI environments or when all required config is already present.
 */
export async function promptForMissingDeployConfig(
	args: DeployArgs,
	config: { configPath?: string; compatibility_date?: string; name?: string }
): Promise<DeployArgs> {
	if (isNonInteractiveOrCI()) {
		return args;
	}

	let promptedForMissing = false;

	// Prompt for name when missing from both CLI args and config
	if (!args.name && !config.name) {
		const defaultName = process
			.cwd()
			.split(path.sep)
			.pop()
			?.replaceAll("_", "-")
			.trim();
		const isValidName = defaultName && /^[a-zA-Z0-9-]+$/.test(defaultName);
		const projectName = await prompt("What do you want to name your project?", {
			defaultValue: isValidName ? defaultName : "my-project",
		});
		args.name = projectName;
		logger.log("");
		promptedForMissing = true;
	}

	// Prompt for compatibility date when missing
	if (!args.latest && !args.compatibilityDate && !config.compatibility_date) {
		const compatibilityDateStr = getTodaysCompatDate();

		if (
			await confirm(
				`No compatibility date is set. Would you like to use today's date (${compatibilityDateStr})?`
			)
		) {
			args.compatibilityDate = compatibilityDateStr;
			promptedForMissing = true;
			logger.log("");
		} else {
			throw new UserError(
				`A compatibility_date is required when publishing. Add it to your ${configFileName(config.configPath)} file or pass \`--compatibility-date\` via CLI.\nSee https://developers.cloudflare.com/workers/platform/compatibility-dates for more information.`,
				{ telemetryMessage: "missing compatibility date when deploying" }
			);
		}
	}

	const hasConfigFile = !!config.configPath;

	// When no config file exists and we prompted for missing config, offer to write one
	if (!hasConfigFile && promptedForMissing) {
		// When --latest was used, the compat date prompt was skipped but we still
		// need a concrete date in the config file for future deploys without --latest
		const effectiveCompatDate =
			args.compatibilityDate ??
			(args.latest ? getTodaysCompatDate() : undefined);

		const configContent: Record<string, unknown> = {
			name: args.name,
			compatibility_date: effectiveCompatDate,
		};
		if (args.script) {
			configContent.main = args.script;
		}
		if (args.assets) {
			configContent.assets = { directory: args.assets };
		}

		const writeConfigFile = await confirm(
			`Do you want Wrangler to write a wrangler.jsonc config file to store this configuration?\n${chalk.dim(
				"This will allow you to simply run `wrangler deploy` on future deployments."
			)}`
		);

		if (writeConfigFile) {
			const configPath = path.join(process.cwd(), "wrangler.jsonc");
			const jsonString = JSON.stringify(configContent, null, 2);
			writeFileSync(configPath, jsonString);
			logger.log(`Wrote \n${jsonString}\n to ${chalk.bold(configPath)}.`);
			logger.log(
				`Simply run ${chalk.bold("`wrangler deploy`")} next time. Wrangler will automatically use the configuration saved to wrangler.jsonc.`
			);
		} else {
			const scriptPart = args.script ? `${args.script} ` : "";
			const flagParts = [
				args.name ? `--name ${args.name}` : "",
				effectiveCompatDate
					? `--compatibility-date ${effectiveCompatDate}`
					: "",
				args.assets ? `--assets ${args.assets}` : "",
			]
				.filter(Boolean)
				.join(" ");
			logger.log(
				`You should run ${chalk.bold(
					`wrangler deploy ${scriptPart}${flagParts}`
				)} next time to deploy this Worker without going through this flow again.`
			);
		}
		logger.log("\nProceeding with deployment...\n");
	}

	return args;
} /**
 * Discerns if the project is an open-next one. This check is performed in an assertive way to ensure that
 * no false positives happen.
 *
 * @param projectRoot The path to the project's root
 * @returns true if the project is an open-next one, false otherwise
 */
export async function isOpenNextProject(projectRoot: string) {
	try {
		const dirFiles = await readdir(projectRoot);

		const nextConfigFile = dirFiles.find((file) =>
			/^next\.config\.(m|c)?(ts|js)$/.test(file)
		);

		if (!nextConfigFile) {
			// If there is no next config file then the project is not a Next.js one
			return false;
		}

		const opeNextConfigFile = dirFiles.find((file) =>
			/^open-next\.config\.(ts|js)$/.test(file)
		);

		if (!opeNextConfigFile) {
			// If there is no open-next config file then the project is not an OpenNext one
			return false;
		}

		const openNextVersion = getInstalledPackageVersion(
			"@opennextjs/cloudflare",
			projectRoot,
			{
				// We stop at the projectPath/root just to make extra sure we don't hit false positives
				stopAtProjectPath: true,
			}
		);

		return openNextVersion !== undefined;
	} catch {
		// If any error is thrown then we simply assume that we're not running in an OpenNext project
		return false;
	}
}

/**
 * If appropriate (when `wrangler deploy` is run in an OpenNext project without setting the `OPEN_NEXT_DEPLOY` environment variable)
 * this function delegates the deployment operation to `@opennextjs/cloudflare`, otherwise it does nothing.
 *
 * @param projectRoot The path to the project's root
 * @returns true is the deployment has been delegated to open-next, false otherwise
 */
async function maybeDelegateToOpenNextDeployCommand(
	projectRoot: string
): Promise<boolean> {
	if (await isOpenNextProject(projectRoot)) {
		const openNextDeploy = getOpenNextDeployFromEnv();
		if (!openNextDeploy) {
			logger.log(
				"OpenNext project detected, calling `opennextjs-cloudflare deploy`"
			);

			const deployArgIdx = process.argv.findIndex((arg) => arg === "deploy");
			assert(deployArgIdx !== -1, "Could not find `deploy` argument");
			const deployArguments = process.argv.slice(deployArgIdx + 1);

			const { npx } = await getPackageManager();

			await runCommand(
				[npx, "opennextjs-cloudflare", "deploy", ...deployArguments],
				{
					env: {
						// We set `OPEN_NEXT_DEPLOY` here so that it's passed through to the `wrangler deploy` command that OpenNext delegates to in order to prevent an infinite loop
						OPEN_NEXT_DEPLOY: "true",
					},
				}
			);

			return true;
		}
	}
	return false;
}
