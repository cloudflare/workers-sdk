import assert from "node:assert";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
	maybeAppendWranglerToGitIgnoreLikeFile,
	maybeAppendWranglerToGitIgnore,
} from "@cloudflare/cli-shared-helpers/gitignore";
import {
	installPackages,
	installWrangler,
} from "@cloudflare/cli-shared-helpers/packages";
import { getUnsupportedConfigFields, splitRawConfig } from "@cloudflare/config";
import {
	FatalError,
	getTodaysCompatDate,
	parseJSONC,
} from "@cloudflare/workers-utils";
import {
	getWranglerJsonConfigPath,
	hasViteConfig,
} from "./config-module/fs-utils";
import { serializeCloudflareConfig } from "./config-module/serialize";
import {
	assertNonConfigured,
	confirmAutoConfigDetails,
	displayAutoConfigDetails,
} from "./details";
import {
	isFrameworkSupported,
	isKnownFramework,
	type PackageJsonScriptsOverrides,
} from "./frameworks";
import { getFrameworkPackageInfo } from "./frameworks/all-frameworks";
import { Static } from "./frameworks/static";
import { usesTypescript } from "./uses-typescript";
import type { AutoConfigContext } from "./context";
import type {
	AutoConfigDetails,
	AutoConfigDetailsForNonConfiguredProject,
	AutoConfigOptions,
	AutoConfigSummary,
} from "./types";
import type { PackageJSON, RawConfig } from "@cloudflare/workers-utils";

/**
 * Runs the full autoconfig flow: displays detected settings, confirms with the user,
 * validates the framework version, runs framework configuration, writes wrangler config,
 * updates package.json scripts, and optionally runs the build command.
 *
 * @param autoConfigDetails - The detected project details from `getDetailsForAutoConfig()`.
 * @param autoConfigOptions - Options controlling dry-run, confirmations, build, and context.
 * @returns A summary of all operations performed.
 */
export async function runAutoConfig(
	autoConfigDetails: AutoConfigDetails,
	autoConfigOptions: AutoConfigOptions
): Promise<AutoConfigSummary> {
	const { context } = autoConfigOptions;
	const { logger } = context;
	const dryRun = autoConfigOptions.dryRun === true;
	const runBuild = !dryRun && (autoConfigOptions.runBuild ?? true);
	const skipConfirmations =
		dryRun || autoConfigOptions.skipConfirmations === true;
	const enableWranglerInstallation =
		autoConfigOptions.enableWranglerInstallation ?? true;
	const configFormat = autoConfigOptions.experimentalConfigFormat ?? "jsonc";

	// The new `cloudflare.config.ts` format is only emitted for Vite projects;
	// any other project (including a non-Vite project that requested `ts`)
	// falls back to writing `wrangler.jsonc`.
	const isVite = hasViteConfig(autoConfigDetails.projectPath);
	const useNewConfig = configFormat === "ts" && isVite;

	assertNonConfigured(autoConfigDetails);

	displayAutoConfigDetails(autoConfigDetails, context);

	const updatedAutoConfigDetails = skipConfirmations
		? autoConfigDetails
		: await confirmAutoConfigDetails(autoConfigDetails, context);

	if (autoConfigDetails !== updatedAutoConfigDetails) {
		displayAutoConfigDetails(updatedAutoConfigDetails, context, {
			heading: "Updated Project Settings:",
		});
	}

	autoConfigDetails = updatedAutoConfigDetails;
	assertNonConfigured(autoConfigDetails);

	if (isKnownFramework(autoConfigDetails.framework.id)) {
		const frameworkIsSupported = isFrameworkSupported(
			autoConfigDetails.framework.id
		);
		if (!frameworkIsSupported) {
			throw new FatalError(
				autoConfigDetails.framework.id === "cloudflare-pages"
					? `The target project seems to be using Cloudflare Pages. Automatically migrating from a Pages project to Workers is not yet supported.`
					: `The detected framework ("${autoConfigDetails.framework.name}") cannot be automatically configured.`,
				{ telemetryMessage: "autoconfig run framework unsupported" }
			);
		}
	}

	assert(
		autoConfigDetails.outputDir,
		"The Output Directory is unexpectedly missing"
	);

	const compatibilityDate = getTodaysCompatDate();

	const wranglerConfig: RawConfig = {
		$schema: "node_modules/wrangler/config-schema.json",
		name: autoConfigDetails.workerName,
		compatibility_date: compatibilityDate,
		observability: {
			enabled: true,
		},
	} satisfies RawConfig;

	const { packageManager } = autoConfigDetails;

	const isWorkspaceRoot = autoConfigDetails.isWorkspaceRoot ?? false;

	const frameworkPackageInfo = getFrameworkPackageInfo(
		autoConfigDetails.framework.id
	);
	if (frameworkPackageInfo) {
		autoConfigDetails.framework.validateFrameworkVersion(
			autoConfigDetails.projectPath,
			frameworkPackageInfo,
			context
		);
	}

	const dryRunConfigurationResults =
		await autoConfigDetails.framework.configure({
			outputDir: autoConfigDetails.outputDir,
			projectPath: autoConfigDetails.projectPath,
			workerName: autoConfigDetails.workerName,
			isWorkspaceRoot,
			dryRun: true,
			packageManager,
			context,
		});

	const { npx } = packageManager;

	// In the new programmatic config format the project is driven by `cf`, so
	// the default deploy/version commands must be `cf ...` to stay consistent
	// with the `cf`-based package.json scripts (otherwise the returned summary
	// would advertise `wrangler deploy` while the scripts run `cf deploy`).
	const autoConfigSummary = await buildOperationsSummary(
		{ ...autoConfigDetails, outputDir: autoConfigDetails.outputDir },
		dryRunConfigurationResults.wranglerConfig === null
			? null
			: ensureNodejsCompatIsInConfig({
					...wranglerConfig,
					...dryRunConfigurationResults.wranglerConfig,
				}),
		{
			build:
				dryRunConfigurationResults.buildCommandOverride ??
				autoConfigDetails.buildCommand,
			deploy:
				dryRunConfigurationResults.deployCommandOverride ??
				(useNewConfig ? "cf deploy" : `${npx} wrangler deploy`),
			version:
				dryRunConfigurationResults?.versionCommandOverride ??
				(useNewConfig
					? "cf versions upload"
					: `${npx} wrangler versions upload`),
		},
		context,
		dryRunConfigurationResults.packageJsonScriptsOverrides,
		{ useNewConfig }
	);

	if (
		!(
			skipConfirmations ||
			(await context.dialogs.confirm("Proceed with setup?"))
		)
	) {
		throw new FatalError("Setup cancelled", {
			telemetryMessage: "autoconfig run setup cancelled",
		});
	}

	if (dryRun) {
		logger.log(
			`✋  ${"Autoconfig process run in dry-run mode, existing now."}`
		);
		logger.log("");

		return autoConfigSummary;
	}

	logger.debug(
		`Running autoconfig with:\n${JSON.stringify(autoConfigDetails, null, 2)}...`
	);

	if (autoConfigSummary.wranglerInstall && enableWranglerInstallation) {
		if (useNewConfig) {
			// The new programmatic config (cloudflare.config.ts) is driven by
			// `cf`, so install cf. Vite projects use `@cloudflare/vite-plugin`
			// as the build tool (installed by the framework's own configure
			// step), so wrangler is not needed.
			await installCf(packageManager.type, isWorkspaceRoot);
		} else {
			await installWrangler(packageManager.type, isWorkspaceRoot);
		}
	}

	const configurationResults = await autoConfigDetails.framework.configure({
		outputDir: autoConfigDetails.outputDir,
		projectPath: autoConfigDetails.projectPath,
		workerName: autoConfigDetails.workerName,
		isWorkspaceRoot,
		dryRun: false,
		packageManager,
		context,
	});

	if (autoConfigDetails.packageJson) {
		const packageJsonPath = resolve(
			autoConfigDetails.projectPath,
			"package.json"
		);
		const existingPackageJson = JSON.parse(
			await readFile(packageJsonPath, "utf8")
		) as PackageJSON;

		await writeFile(
			packageJsonPath,
			JSON.stringify(
				{
					...existingPackageJson,
					scripts: {
						...existingPackageJson.scripts,
						...autoConfigSummary.scripts,
					},
				} satisfies PackageJSON,
				null,
				2
			) + "\n"
		);
	}

	if (configurationResults.wranglerConfig !== null) {
		const mergedConfig = ensureNodejsCompatIsInConfig({
			...wranglerConfig,
			...configurationResults.wranglerConfig,
		});
		if (useNewConfig) {
			await saveNewConfig(autoConfigDetails.projectPath, mergedConfig, context);
		} else {
			await saveWranglerJsonc(autoConfigDetails.projectPath, mergedConfig);
		}
	}

	maybeAppendWranglerToGitIgnore(autoConfigDetails.projectPath);

	// If we're uploading the project path as the output directory, make sure we don't accidentally upload any sensitive Wrangler files
	if (autoConfigDetails.outputDir === autoConfigDetails.projectPath) {
		maybeAppendWranglerToGitIgnoreLikeFile(
			`${autoConfigDetails.projectPath}/.assetsignore`
		);
	}

	const buildCommand =
		configurationResults.buildCommandOverride ?? autoConfigDetails.buildCommand;

	if (buildCommand && runBuild) {
		await context.runCommand(
			buildCommand,
			autoConfigDetails.projectPath,
			"[build]"
		);
	}

	return autoConfigSummary;
}

/**
 * Given a wrangler config object this function makes sure that the `nodejs_compat` flag is present
 * in its `compatibility_flags` setting.
 *
 * Just to be sure the function also filters out any compatibility flag already present starting with `nodejs_` (e.g. `nodejs_als`)
 *
 * @param wranglerConfig The target wrangler config object
 * @returns A copy of the config object where the `compatibility_flags` settings is assured to contain `nodejs_compat`
 */
/**
 * Install the `cf` CLI as a dev dependency. The `cf`-equivalent of
 * `installWrangler`, used when emitting the new `cloudflare.config.ts`
 * format (which is driven by `cf`, not `wrangler`).
 */
async function installCf(
	packageManager: "npm" | "pnpm" | "yarn" | "bun",
	isWorkspaceRoot: boolean
): Promise<void> {
	await installPackages(packageManager, ["cf@latest"], {
		dev: true,
		isWorkspaceRoot,
		startText: "Installing cf (the Cloudflare CLI)",
		doneText: `installed via \`${packageManager} install cf --save-dev\``,
	});
}

function ensureNodejsCompatIsInConfig(wranglerConfig: RawConfig): RawConfig {
	if (wranglerConfig.compatibility_flags?.includes("nodejs_compat")) {
		return wranglerConfig;
	}

	return {
		...wranglerConfig,
		compatibility_flags: [
			...(wranglerConfig.compatibility_flags?.filter(
				(flag) => !flag.startsWith("nodejs_")
			) ?? []),
			"nodejs_compat",
		],
	};
}

/**
 * Saves the a wrangler.jsonc file for the current project potentially combining new values to the potential
 * pre-existing wrangler config file generated by the framework's CLI
 *
 * @param projectPath The project's path
 * @param baseWranglerConfig The wrangler config to use
 */
async function saveWranglerJsonc(
	projectPath: string,
	wranglerConfig: RawConfig
): Promise<void> {
	let existingWranglerConfig: RawConfig = {};

	const wranglerConfigPath = getWranglerJsonConfigPath(projectPath);
	if (wranglerConfigPath) {
		const existingContent = await readFile(wranglerConfigPath, "utf8");
		existingWranglerConfig = parseJSONC(
			existingContent,
			wranglerConfigPath
		) as RawConfig;
	}

	await writeFile(
		resolve(projectPath, "wrangler.jsonc"),
		JSON.stringify(
			{
				...existingWranglerConfig,
				...wranglerConfig,
			},
			null,
			2
		) + "\n"
	);
}

/**
 * Experimental: write the new programmatic config format
 * (`cloudflare.config.ts`) instead of `wrangler.jsonc`. Only used for Vite
 * projects, whose build tool (`@cloudflare/vite-plugin`) owns tooling
 * settings.
 *
 * The runtime config is written from the config autoconfig assembled in
 * memory (its base config plus the framework's returned `wranglerConfig`); any
 * `wrangler.jsonc` a framework wrote to disk is deliberately left untouched,
 * as it may not be compatible with the new format. Tooling fields (owned by
 * Vite) and fields the new format doesn't support are surfaced as warnings
 * rather than silently dropped.
 *
 * @param projectPath The project's path
 * @param rawConfig The merged Wrangler `RawConfig` to convert + write
 * @param context The autoconfig context providing the logger
 */
async function saveNewConfig(
	projectPath: string,
	rawConfig: RawConfig,
	context: AutoConfigContext
): Promise<void> {
	const { logger } = context;

	const { worker, tooling } = splitRawConfig(rawConfig);

	const unsupportedFields = getUnsupportedConfigFields(rawConfig);
	if (unsupportedFields.length > 0) {
		logger.warn(
			`The new config format does not yet support these fields, so they ` +
				`were not written to a config file: ${unsupportedFields.join(", ")}.`
		);
	}

	await writeFile(
		resolve(projectPath, "cloudflare.config.ts"),
		serializeCloudflareConfig(worker)
	);

	// Tooling settings (assets directory, bundling, dev server) are owned by
	// Vite, so they aren't written to a config file. Surface any that were
	// present rather than dropping them silently.
	const toolingKeys = Object.keys(tooling);
	if (toolingKeys.length > 0) {
		logger.warn(
			`These tooling settings are owned by Vite and were not written to ` +
				`a config file: ${toolingKeys.join(", ")}. ` +
				`Configure them via the Cloudflare Vite plugin instead.`
		);
	}
}

/**
 * Builds a summary of all operations that autoconfig will (or did) perform,
 * including package installation, package.json script updates, wrangler config
 * creation, and framework-specific configuration.
 *
 * @param autoConfigDetails - The detected project details.
 * @param wranglerConfigToWrite - The wrangler config object to write, or `null` if not applicable.
 * @param projectCommands - The build, deploy, and version commands for the project.
 * @param context - The autoconfig context providing logger and other dependencies.
 * @param packageJsonScriptsOverrides - Optional overrides for package.json script entries.
 * @returns A summary object describing all planned operations.
 */
export async function buildOperationsSummary(
	autoConfigDetails: AutoConfigDetailsForNonConfiguredProject & {
		outputDir: NonNullable<AutoConfigDetails["outputDir"]>;
	},
	wranglerConfigToWrite: RawConfig | null,
	projectCommands: {
		build?: string;
		deploy: string;
		version?: string;
	},
	context: AutoConfigContext,
	packageJsonScriptsOverrides?: PackageJsonScriptsOverrides,
	configPreview?: {
		useNewConfig?: boolean;
	}
): Promise<AutoConfigSummary> {
	const { logger } = context;
	// The new config format is driven by `cf`; the legacy jsonc format by
	// `wrangler`. This selects the CLI used for installs + package.json scripts.
	const useNewConfig = configPreview?.useNewConfig === true;
	logger.log("");

	const summary: AutoConfigSummary = {
		wranglerInstall: false,
		scripts: {},
		...(wranglerConfigToWrite !== null
			? {
					wranglerConfig: wranglerConfigToWrite,
				}
			: {}),
		outputDir: autoConfigDetails.outputDir,
		frameworkId: autoConfigDetails.framework.id,
		buildCommand: projectCommands.build,
		deployCommand: projectCommands.deploy,
		versionCommand: projectCommands.version,
	};

	if (autoConfigDetails.packageJson) {
		// If there is a package.json file we will want to install wrangler
		summary.wranglerInstall = true;

		logger.log("📦 Install packages:");
		if (useNewConfig) {
			// The new config (cloudflare.config.ts) is driven by `cf`; Vite is
			// the build tool, so wrangler is not installed.
			logger.log(` - cf (devDependency)`);
		} else {
			logger.log(` - wrangler (devDependency)`);
		}
		logger.log("");

		if (useNewConfig) {
			// `cf deploy` / `cf dev` run the framework build themselves, so the
			// scripts don't prepend the build command (unlike the wrangler path).
			summary.scripts = {
				deploy: "cf deploy",
				preview: "cf dev",
			};
		} else {
			summary.scripts = {
				deploy:
					packageJsonScriptsOverrides?.deploy ??
					(autoConfigDetails.buildCommand
						? `${autoConfigDetails.buildCommand} && wrangler deploy`
						: `wrangler deploy`),
				preview:
					packageJsonScriptsOverrides?.preview ??
					(autoConfigDetails.buildCommand
						? `${autoConfigDetails.buildCommand} && wrangler dev`
						: `wrangler dev`),
			};

			const containsServerSideCode =
				// If there is an entrypoint then we know that there is server side code
				!!wranglerConfigToWrite?.main;

			if (
				// If there is no server side code, then there is no need to add the cf-typegen script
				containsServerSideCode &&
				usesTypescript(autoConfigDetails.projectPath) &&
				!("cf-typegen" in (autoConfigDetails.packageJson.scripts ?? {}))
			) {
				summary.scripts["cf-typegen"] =
					packageJsonScriptsOverrides?.typegen ?? "wrangler types";
			}
		}

		logger.log("📝 Update package.json scripts:");
		for (const [name, script] of Object.entries(summary.scripts)) {
			logger.log(` - "${name}": "${script}"`);
		}
		logger.log("");
	}

	if (wranglerConfigToWrite) {
		if (useNewConfig) {
			const { worker } = splitRawConfig(wranglerConfigToWrite);
			logger.log("📄 Create cloudflare.config.ts:");
			logger.log(
				"  " + serializeCloudflareConfig(worker).replace(/\n/g, "\n  ")
			);
			logger.log("");
		} else {
			const wranglerConfigPath = resolve(
				autoConfigDetails.projectPath,
				"wrangler.jsonc"
			);
			const configExists = existsSync(wranglerConfigPath);
			logger.log(
				configExists ? "📄 Update wrangler.jsonc:" : "📄 Create wrangler.jsonc:"
			);
			logger.log(
				"  " +
					JSON.stringify(wranglerConfigToWrite, null, 2).replace(/\n/g, "\n  ")
			);
			logger.log("");
		}
	}

	if (
		autoConfigDetails.framework &&
		!(autoConfigDetails.framework instanceof Static) &&
		!autoConfigDetails.framework.isConfigured(autoConfigDetails.projectPath)
	) {
		summary.frameworkConfiguration =
			autoConfigDetails.framework.configurationDescription ??
			`Configuring project for ${autoConfigDetails.framework.name}`;

		logger.log(`🛠️  ${summary.frameworkConfiguration}`);
		logger.log("");
	}

	return summary;
}
