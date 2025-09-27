import assert from "node:assert";
import { statSync, writeFileSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { getAssetsOptions, validateAssetsArgsAndConfig } from "../assets";
import { configFileName } from "../config";
import { createCommand } from "../core/create-command";
import { ensureConfigExists, ConfigWithMetadata } from "../config";
import { getEntry } from "../deployment-bundle/entry";
import { confirm, prompt } from "../dialogs";
import { getCIOverrideName } from "../environment-variables/misc-variables";
import { UserError } from "../errors";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { verifyWorkerMatchesCITag } from "../match-tag";
import * as metrics from "../metrics";
import { writeOutput } from "../output";
import { getSiteAssetPaths } from "../sites";
import { requireAuth } from "../user";
import { collectKeyValues } from "../utils/collectKeyValues";
import { formatCompatibilityDate } from "../utils/compatibility-date";
import { getRules } from "../utils/getRules";
import { getScriptName } from "../utils/getScriptName";
import { isLegacyEnv } from "../utils/isLegacyEnv";
import deploy from "./deploy";

export const deployCommand = createCommand({
	metadata: {
		description: "🆙 Deploy a Worker to Cloudflare",
		owner: "Workers: Deploy and Config",
		status: "stable",
	},
	positionalArgs: ["script"],
	args: {
		script: {
			describe: "The path to an entry point for your Worker",
			type: "string",
			requiresArg: true,
		},
		name: {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		},
		bundle: {
			describe: "Run Wrangler's compilation step before publishing",
			type: "boolean",
			hidden: true,
		},
		"no-bundle": {
			describe: "Skip internal build steps and directly deploy Worker",
			type: "boolean",
			default: false,
		},
		outdir: {
			describe: "Output directory for the bundled Worker",
			type: "string",
			requiresArg: true,
		},
		outfile: {
			describe: "Output file for the bundled worker",
			type: "string",
			requiresArg: true,
		},
		"compatibility-date": {
			describe: "Date to use for compatibility checks",
			type: "string",
			requiresArg: true,
		},
		"compatibility-flags": {
			describe: "Flags to use for compatibility checks",
			alias: "compatibility-flag",
			type: "string",
			requiresArg: true,
			array: true,
		},
		latest: {
			describe: "Use the latest version of the Workers runtime",
			type: "boolean",
			default: false,
		},
		assets: {
			describe: "Static assets to be served. Replaces Workers Sites.",
			type: "string",
			requiresArg: true,
		},
		site: {
			describe: "Root folder of static assets for Workers Sites",
			type: "string",
			requiresArg: true,
			hidden: true,
			deprecated: true,
		},
		"site-include": {
			describe:
				"Array of .gitignore-style patterns that match file or directory names from the sites directory. Only matched items will be uploaded.",
			type: "string",
			requiresArg: true,
			array: true,
			hidden: true,
			deprecated: true,
		},
		"site-exclude": {
			describe:
				"Array of .gitignore-style patterns that match file or directory names from the sites directory. Matched items will not be uploaded.",
			type: "string",
			requiresArg: true,
			array: true,
			hidden: true,
			deprecated: true,
		},
		var: {
			describe: "A key-value pair to be injected into the script as a variable",
			type: "string",
			requiresArg: true,
			array: true,
		},
		define: {
			describe: "A key-value pair to be substituted in the script",
			type: "string",
			requiresArg: true,
			array: true,
		},
		alias: {
			describe: "A module pair to be substituted in the script",
			type: "string",
			requiresArg: true,
			array: true,
		},
		triggers: {
			describe: "cron schedules to attach",
			alias: ["schedule", "schedules"],
			type: "string",
			requiresArg: true,
			array: true,
		},
		routes: {
			describe: "Routes to upload",
			alias: "route",
			type: "string",
			requiresArg: true,
			array: true,
		},
		domains: {
			describe: "Custom domains to deploy to",
			alias: "domain",
			type: "string",
			requiresArg: true,
			array: true,
		},
		"jsx-factory": {
			describe: "The function that is called for each JSX element",
			type: "string",
			requiresArg: true,
		},
		"jsx-fragment": {
			describe: "The function that is called for each JSX fragment",
			type: "string",
			requiresArg: true,
		},
		tsconfig: {
			describe: "Path to a custom tsconfig.json file",
			type: "string",
			requiresArg: true,
		},
		minify: {
			describe: "Minify the Worker",
			type: "boolean",
		},
		"node-compat": {
			describe: "Enable Node.js compatibility",
			type: "boolean",
			hidden: true,
			deprecated: true,
		},
		"dry-run": {
			describe: "Don't actually deploy",
			type: "boolean",
		},
		metafile: {
			describe:
				"Path to output build metadata from esbuild. If flag is used without a path, defaults to 'bundle-meta.json' inside the directory specified by --outdir.",
			type: "string",
			coerce: (v: string) => (!v ? true : v),
		},
		"keep-vars": {
			describe:
				"When not used (or set to false), Wrangler will delete all vars before setting those found in the Wrangler configuration.\n" +
				"When used (and set to true), the environment variables are not deleted before the deployment.\n" +
				"If you set variables via the dashboard you probably want to use this flag.\n" +
				"Note that secrets are never deleted by deployments.",
			default: false,
			type: "boolean",
		},
		"legacy-env": {
			type: "boolean",
			describe: "Use legacy environments",
			hidden: true,
		},
		logpush: {
			type: "boolean",
			describe:
				"Send Trace Events from this Worker to Workers Logpush.\nThis will not configure a corresponding Logpush job automatically.",
		},
		"upload-source-maps": {
			type: "boolean",
			describe: "Include source maps when uploading this Worker.",
		},
		"old-asset-ttl": {
			describe:
				"Expire old assets in given seconds rather than immediate deletion.",
			type: "number",
		},
		"dispatch-namespace": {
			describe:
				"Name of a dispatch namespace to deploy the Worker to (Workers for Platforms)",
			type: "string",
		},
		"experimental-auto-create": {
			describe: "Automatically provision draft bindings with new resources",
			type: "boolean",
			default: true,
			hidden: true,
			alias: "x-auto-create",
		},
		"auto-config": {
			describe: "Automatically detect framework and generate configuration",
			type: "boolean",
			default: true,
			alias: "auto"
		},
		"skip-framework-detection": {
			describe: "Skip automatic framework detection and adapter installation",
			type: "boolean",
			default: false,
			hidden: true
		},
		"containers-rollout": {
			describe:
				"Rollout strategy for Containers changes. If set to immediate, it will override `rollout_percentage_steps` if configured and roll out to 100% of instances in one step. ",
			choices: ["immediate", "gradual"] as const,
		},
		"experimental-deploy-remote-diff-check": {
			describe: `Experimental: Enable The Deployment Remote Diff check`,
			type: "boolean",
			hidden: true,
			alias: ["x-remote-diff-check"],
		},
	},
	behaviour: {
		useConfigRedirectIfAvailable: true,
		overrideExperimentalFlags: (args) => ({
			MULTIWORKER: false,
			RESOURCES_PROVISION: args.experimentalProvision ?? false,
			REMOTE_BINDINGS: args.experimentalRemoteBindings ?? true,
			DEPLOY_REMOTE_DIFF_CHECK: args.experimentalDeployRemoteDiffCheck ?? false,
		}),
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
	},
	validateArgs(args) {
		if (args.nodeCompat) {
			throw new UserError(
				`The --node-compat flag is no longer supported as of Wrangler v4. Instead, use the \`nodejs_compat\` compatibility flag. This includes the functionality from legacy \`node_compat\` polyfills and natively implemented Node.js APIs. See https://developers.cloudflare.com/workers/runtime-apis/nodejs for more information.`,
				{ telemetryMessage: true }
			);
		}
	},

	async handler(args, { config }) {
		if (config.pages_build_output_dir) {
			throw new UserError(
				"It looks like you've run a Workers-specific command in a Pages project.\n" +
					"For Pages, please run `wrangler pages deploy` instead.",
				{ telemetryMessage: true }
			);
		}
		
		const projectRoot =
			config.userConfigPath && path.dirname(config.userConfigPath);

		let finalConfig = config;
		let configPath = config.configPath;
		let wasConfigGenerated = false;

		// Framework detection and auto-generation
		if (!config.configPath && args.autoConfig && !args.skipFrameworkDetection) {
			try {
				logger.debug("No configuration found, attempting framework detection...");
				
				const configResult = await ensureConfigExists(
					undefined,
					!isNonInteractiveOrCI()
				);
				
				finalConfig = configResult.config;
				configPath = configResult.configPath;
				wasConfigGenerated = configResult.wasGenerated;

				if (wasConfigGenerated) {
					const frameworkName = (finalConfig as ConfigWithMetadata)._framework;
					logger.log(`Detected ${frameworkName} project and generated configuration`);
					
					// Try to install framework adapter
					if (!args.skipFrameworkDetection && frameworkName) {
						try {
							const { installFrameworkAdapter } = await import("../framework-detection/adapters");
							await installFrameworkAdapter(frameworkName, projectRoot);
						} catch (error) {
							logger.debug("Framework adapter installation failed:", error);
						}
					}
				}
			} catch (error) {
				logger.debug("Framework detection failed, continuing with original flow");
			}
		}

		// Handle directory arguments (original Wrangler logic)
		if (!configPath) {
			if (args.script) {
				try {
					const stats = statSync(args.script);
					if (stats.isDirectory()) {
						args = await handleMaybeAssetsDeployment(args.script, args);
					}
				} catch (error) {
					if (error instanceof UserError) {
						throw error;
					}
				}
			}
			else if (args.assets && (!args.compatibilityDate || !args.name)) {
				args = await handleMaybeAssetsDeployment(args.assets, args);
			}
		}

		const entry = await getEntry(args, finalConfig, "deploy");
		validateAssetsArgsAndConfig(args, finalConfig);
		const assetsOptions = getAssetsOptions(args, finalConfig);

		if (args.latest) {
			logger.warn(
				`Using the latest version of the Workers runtime. To silence this warning, please choose a specific version of the runtime with --compatibility-date, or add a compatibility_date to your ${configFileName(configPath)} file.`
			);
		}

		const cliVars = collectKeyValues(args.var);
		const cliDefines = collectKeyValues(args.define);
		const cliAlias = collectKeyValues(args.alias);
		const accountId = args.dryRun ? undefined : await requireAuth(finalConfig);

		const siteAssetPaths = getSiteAssetPaths(
			finalConfig,
			args.site,
			args.siteInclude,
			args.siteExclude
		);

		const beforeUpload = Date.now();
		let name = getScriptName(args, finalConfig);

		const ciOverrideName = getCIOverrideName();
		let workerNameOverridden = false;
		if (ciOverrideName !== undefined && ciOverrideName !== name) {
			logger.warn(
				`Failed to match Worker name. Your config file is using the Worker name "${name}", but the CI system expected "${ciOverrideName}". Overriding using the CI provided Worker name. Workers Builds connected builds will attempt to open a pull request to resolve this config name mismatch.`
			);
			name = ciOverrideName;
			workerNameOverridden = true;
		}

		if (!name) {
			throw new UserError(
				'You need to provide a name when publishing a worker. Either pass it as a cli arg with `--name <name>` or in your config file as `name = "<name>"`',
				{ telemetryMessage: true }
			);
		}

		if (!args.dryRun) {
			assert(accountId, "Missing account ID");
			await verifyWorkerMatchesCITag(
				finalConfig,
				accountId,
				name,
				configPath
			);
		}
		
		const { sourceMapSize, versionId, workerTag, targets } = await deploy({
			config: finalConfig,
			accountId,
			name,
			rules: getRules(finalConfig),
			entry,
			env: args.env,
			compatibilityDate: args.latest
				? formatCompatibilityDate(new Date())
				: args.compatibilityDate,
			compatibilityFlags: args.compatibilityFlags,
			vars: cliVars,
			defines: cliDefines,
			alias: cliAlias,
			triggers: args.triggers,
			jsxFactory: args.jsxFactory,
			jsxFragment: args.jsxFragment,
			tsconfig: args.tsconfig,
			routes: args.routes,
			domains: args.domains,
			assetsOptions,
			legacyAssetPaths: siteAssetPaths,
			legacyEnv: isLegacyEnv(finalConfig),
			minify: args.minify,
			isWorkersSite: Boolean(args.site || finalConfig.site),
			outDir: args.outdir,
			outFile: args.outfile,
			dryRun: args.dryRun,
			metafile: args.metafile,
			noBundle: !(args.bundle ?? !finalConfig.no_bundle),
			keepVars: args.keepVars,
			logpush: args.logpush,
			uploadSourceMaps: args.uploadSourceMaps,
			oldAssetTtl: args.oldAssetTtl,
			projectRoot,
			dispatchNamespace: args.dispatchNamespace,
			experimentalAutoCreate: args.experimentalAutoCreate,
			containersRollout: args.containersRollout,
		});

		writeOutput({
			type: "deploy",
			version: 1,
			worker_name: name ?? null,
			worker_tag: workerTag,
			version_id: versionId,
			targets,
			wrangler_environment: args.env,
			worker_name_overridden: workerNameOverridden,
		});

		metrics.sendMetricsEvent(
			"deploy worker script",
			{
				usesTypeScript: /\.tsx?$/.test(entry.file),
				durationMs: Date.now() - beforeUpload,
				sourceMapSize,
			},
			{
				sendMetrics: finalConfig.send_metrics,
			}
		);
	},
});

export type DeployArgs = (typeof deployCommand)["args"];

export async function handleMaybeAssetsDeployment(
	assetDirectory: string,
	args: DeployArgs
): Promise<DeployArgs> {
	if (isNonInteractiveOrCI()) {
		return args;
	}

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
			return args;
		}
	}

	if (!args.name) {
		const defaultName = process.cwd().split(path.sep).pop()?.replace("_", "-");
		const isValidName = defaultName && /^[a-zA-Z0-9-]+$/.test(defaultName);
		const projectName = await prompt("What do you want to name your project?", {
			defaultValue: isValidName ? defaultName : "my-project",
		});
		args.name = projectName;
		logger.log("");
	}

	if (!args.compatibilityDate) {
		const compatibilityDate = formatCompatibilityDate(new Date());
		args.compatibilityDate = compatibilityDate;
		logger.log(
			`${chalk.bold("No compatibility date found")} Defaulting to today:`,
			compatibilityDate
		);
		logger.log("");
	}

	const writeConfig = await confirm(
		`Do you want Wrangler to write a wrangler.json config file to store this configuration?\n${chalk.dim("This will allow you to simply run `wrangler deploy` on future deployments.")}`
	);

	if (writeConfig) {
		const configPath = path.join(process.cwd(), "wrangler.jsonc");
		const jsonString = JSON.stringify(
			{
				name: args.name,
				compatibility_date: args.compatibilityDate,
				assets: { directory: args.assets },
			},
			null,
			2
		);
		writeFileSync(configPath, jsonString);
		logger.log(`Wrote \n${jsonString}\n to ${chalk.bold(configPath)}.`);
		logger.log(
			`Please run ${chalk.bold("`wrangler deploy`")} instead of ${chalk.bold(`\`wrangler deploy ${args.assets}\``)} next time. Wrangler will automatically use the configuration saved to wrangler.jsonc.`
		);
	} else {
		logger.log(
			`You should run ${chalk.bold(
				`wrangler deploy --name ${args.name} --compatibility-date ${args.compatibilityDate} --assets ${args.assets}`
			)} next time to deploy this Worker without going through this flow again.`
		);
	}
	logger.log("\nProceeding with deployment...\n");
	return args;
}
