import { writeFileSync } from "node:fs";
import path from "node:path";
import {
	configFileName,
	getTodaysCompatDate,
	UserError,
	type Config,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { getDetailsForAutoConfig } from "../autoconfig/details";
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
import { collectKeyValues } from "../utils/collectKeyValues";
import type { ReadConfigCommandArgs } from "../config";

/**
 * CLI flags that affect the worker's deployment configuration.
 * These are persisted to the generated wrangler.jsonc and/or included
 * in the suggested CLI command during the interactive deploy flow.
 */
type DeployConfigFlags = {
	compatibilityDate: string | undefined;
	compatibilityFlags: string[] | undefined;
	// Routing & scheduling
	routes: string[] | undefined;
	domains: string[] | undefined;
	triggers: string[] | undefined;
	// Variables & build-time substitutions
	var: string[] | undefined;
	define: string[] | undefined;
	alias: string[] | undefined;
	// Build configuration
	jsxFactory: string | undefined;
	jsxFragment: string | undefined;
	tsconfig: string | undefined;
	minify: boolean | undefined;
	uploadSourceMaps: boolean | undefined;
	bundle: boolean | undefined;
	// Deployment behavior
	logpush: boolean | undefined;
	keepVars: boolean | undefined;
	legacyEnv: boolean | undefined;
	dispatchNamespace: string | undefined;
};

/**
 * The full set of CLI args consumed by the interactive deploy autoconfig flow.
 * Combines the base config/script/name args from {@link ReadConfigCommandArgs},
 * all deployment-affecting flags from {@link DeployConfigFlags}, and the
 * autoconfig-specific control flags (autoconfig, assets, dryRun, latest).
 */
type AutoConfigArgs = ReadConfigCommandArgs &
	DeployConfigFlags & {
		autoconfig: boolean | undefined;
		path: string | undefined;
		assets: string | undefined;
		dryRun: boolean | undefined;
		latest: boolean | undefined;
	};

/**
 * Runs autoconfig if applicable, including open-next delegation and interactive
 * prompts for missing config. Returns `{ aborted: true }` if deploy should not
 * proceed (user declined or delegated to open-next), otherwise returns the
 * potentially-updated config and args.
 */
export async function maybeRunAutoConfig<Args extends AutoConfigArgs>(
	args: Args,
	config: Config
): Promise<{ config: Config; aborted: boolean }> {
	const shouldRunAutoConfig =
		args.autoconfig &&
		// If there is a positional parameter, an assets directory specified via --assets, or an
		// explicit --config path then we don't want to run autoconfig since we assume that the
		// user knows what they are doing and that they are specifying what needs to be deployed
		!args.path &&
		!args.script &&
		!args.assets &&
		!args.config;
	if (
		config.pages_build_output_dir &&
		// Note: autoconfig handle Pages projects on its own, so we don't want to hard fail here if autoconfig run
		!shouldRunAutoConfig
	) {
		throw new UserError(
			"It looks like you've run a Workers-specific command in a Pages project.\n" +
				"For Pages, please run `wrangler pages deploy` instead.",
			{ telemetryMessage: "deploy command pages project mismatch" }
		);
	}
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

	return { config, aborted: false };
}

/**
 * Interactively prompts for missing deployment configuration (name, compatibility date,
 * and optionally config file writing when no config file exists).
 * No-op in non-interactive/CI environments or when all required config is already present.
 */
export async function promptForMissingDeployConfig<Args extends AutoConfigArgs>(
	args: Args,
	config: { configPath?: string; compatibility_date?: string; name?: string }
): Promise<Args> {
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
		if (args.compatibilityFlags?.length) {
			configContent.compatibility_flags = args.compatibilityFlags;
		}
		if (args.routes?.length || args.domains?.length) {
			const routeEntries: unknown[] = [...(args.routes ?? [])];
			for (const domain of args.domains ?? []) {
				routeEntries.push({ pattern: domain, custom_domain: true });
			}
			configContent.routes = routeEntries;
		}
		if (args.triggers?.length) {
			configContent.triggers = { crons: args.triggers };
		}
		if (args.var?.length) {
			configContent.vars = collectKeyValues(args.var);
		}
		if (args.define?.length) {
			configContent.define = collectKeyValues(args.define);
		}
		if (args.alias?.length) {
			configContent.alias = collectKeyValues(args.alias);
		}
		if (args.jsxFactory) {
			configContent.jsx_factory = args.jsxFactory;
		}
		if (args.jsxFragment) {
			configContent.jsx_fragment = args.jsxFragment;
		}
		if (args.tsconfig) {
			configContent.tsconfig = args.tsconfig;
		}
		if (args.minify) {
			configContent.minify = true;
		}
		if (args.uploadSourceMaps) {
			configContent.upload_source_maps = true;
		}
		if (args.bundle === false) {
			configContent.no_bundle = true;
		}
		if (args.logpush) {
			configContent.logpush = true;
		}
		if (args.keepVars) {
			configContent.keep_vars = true;
		}
		if (args.legacyEnv) {
			configContent.legacy_env = true;
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
				`\nSimply run ${chalk.bold("`wrangler deploy`")} next time. Wrangler will automatically use the configuration saved to wrangler.jsonc.`
			);
		} else {
			const pathPart =
				(args.path ?? args.script) ? `${args.path ?? args.script} ` : "";
			const flagParts = [
				args.name ? `--name ${args.name}` : "",
				effectiveCompatDate
					? `--compatibility-date ${effectiveCompatDate}`
					: "",
				// Only omit --assets when the positional path already covers the assets directory
				args.assets && args.assets !== args.path
					? `--assets ${args.assets}`
					: "",
				...(args.compatibilityFlags?.length
					? [`--compatibility-flags ${args.compatibilityFlags.join(" ")}`]
					: []),
				...(args.routes?.length ? [`--routes ${args.routes.join(" ")}`] : []),
				...(args.domains?.length
					? [`--domains ${args.domains.join(" ")}`]
					: []),
				...(args.triggers?.length
					? [`--triggers ${args.triggers.map((t) => `'${t}'`).join(" ")}`]
					: []),
				...(args.var?.length ? [`--var ${args.var.join(" ")}`] : []),
				...(args.define?.length ? [`--define ${args.define.join(" ")}`] : []),
				...(args.alias?.length ? [`--alias ${args.alias.join(" ")}`] : []),
				...(args.jsxFactory ? [`--jsx-factory ${args.jsxFactory}`] : []),
				...(args.jsxFragment ? [`--jsx-fragment ${args.jsxFragment}`] : []),
				...(args.tsconfig ? [`--tsconfig ${args.tsconfig}`] : []),
				...(args.minify ? ["--minify"] : []),
				...(args.uploadSourceMaps ? ["--upload-source-maps"] : []),
				...(args.bundle === false ? ["--no-bundle"] : []),
				...(args.logpush ? ["--logpush"] : []),
				...(args.keepVars ? ["--keep-vars"] : []),
				...(args.legacyEnv ? ["--legacy-env"] : []),
				...(args.dispatchNamespace
					? [`--dispatch-namespace ${args.dispatchNamespace}`]
					: []),
			]
				.filter(Boolean)
				.join(" ");
			logger.log(
				`\nYou should run ${chalk.bold(
					`wrangler deploy ${pathPart}${flagParts}`
				)} next time to deploy this Worker without going through this flow again.`
			);
		}
		logger.log("\nProceeding with deployment...\n");
	}

	return args;
}
