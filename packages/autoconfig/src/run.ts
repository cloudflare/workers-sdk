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
import { convertToWranglerConfig, InputWorkerSchema } from "@cloudflare/config";
import {
	DEFAULT_COMPAT_DATE,
	FatalError,
	isNodejsCompatDefaultOn,
	parseJSONC,
} from "@cloudflare/workers-utils";
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
import type { AutoConfigContext, AutoConfigTarget } from "./context";
import type {
	BuildConfig,
	ConfigurationResults,
} from "./frameworks/framework-class";
import type {
	AutoConfigDetails,
	AutoConfigDetailsForNonConfiguredProject,
	AutoConfigOptions,
	AutoConfigSummary,
} from "./types";
import type { WorkerConfigInput } from "@cloudflare/config";
import type { PackageJSON, RawConfig } from "@cloudflare/workers-utils";

/**
 * Runs the full autoconfig flow: displays detected settings, confirms with the user,
 * validates the framework version, runs framework configuration, writes configuration,
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
	const target = autoConfigOptions.target ?? "cf";
	const { logger } = context;
	const dryRun = autoConfigOptions.dryRun === true;
	const runBuild = !dryRun && (autoConfigOptions.runBuild ?? true);
	const skipConfirmations =
		dryRun || autoConfigOptions.skipConfirmations === true;
	const enableTargetCliInstallation =
		autoConfigOptions.enableTargetCliInstallation ?? true;

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

	const compatibilityDate = DEFAULT_COMPAT_DATE;

	const defaultWorkerConfig: WorkerConfigInput = {
		name: autoConfigDetails.workerName,
		compatibilityDate,
		observability: {
			enabled: true,
		},
	};

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
			target,
			outputDir: autoConfigDetails.outputDir,
			projectPath: autoConfigDetails.projectPath,
			workerName: autoConfigDetails.workerName,
			isWorkspaceRoot,
			dryRun: true,
			packageManager,
			context,
		});
	const dryRunWorkerConfig = mergeWorkerConfig(
		defaultWorkerConfig,
		dryRunConfigurationResults.workerConfig
	);
	if (
		target === "cf" &&
		dryRunConfigurationResults.buildTool === "wrangler" &&
		dryRunConfigurationResults.buildConfig &&
		existsSync(resolve(autoConfigDetails.projectPath, "wrangler.config.ts"))
	) {
		throw new FatalError(
			"Cannot generate wrangler.config.ts because the file already exists. Remove or rename the existing file, then run autoconfig again.",
			{ telemetryMessage: "autoconfig wrangler config conflict" }
		);
	}

	const { npx } = packageManager;

	const autoConfigSummary = await buildOperationsSummary(
		{ ...autoConfigDetails, outputDir: autoConfigDetails.outputDir },
		dryRunWorkerConfig,
		dryRunConfigurationResults,
		{
			build:
				dryRunConfigurationResults.buildCommandOverride ??
				autoConfigDetails.buildCommand,
			deploy:
				dryRunConfigurationResults.deployCommandOverride ??
				`${npx} ${target} deploy`,
			version:
				dryRunConfigurationResults.versionCommandOverride ??
				`${npx} ${target} versions upload`,
		},
		enableTargetCliInstallation,
		target,
		context,
		dryRunConfigurationResults.packageJsonScriptsOverrides
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

	if (autoConfigDetails.packageJson && enableTargetCliInstallation) {
		if (target === "cf") {
			await installPackages(packageManager.type, ["cf@latest"], {
				dev: true,
				isWorkspaceRoot,
			});
		} else {
			await installWrangler(packageManager.type, isWorkspaceRoot);
		}
	}

	if (
		autoConfigDetails.packageJson &&
		target === "cf" &&
		dryRunConfigurationResults.buildTool === "wrangler"
	) {
		await installWrangler(packageManager.type, isWorkspaceRoot);
	}

	const configurationResults = await autoConfigDetails.framework.configure({
		target,
		outputDir: autoConfigDetails.outputDir,
		projectPath: autoConfigDetails.projectPath,
		workerName: autoConfigDetails.workerName,
		isWorkspaceRoot,
		dryRun: false,
		packageManager,
		context,
	});
	const workerConfig = mergeWorkerConfig(
		defaultWorkerConfig,
		configurationResults.workerConfig
	);

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

	if (target === "wrangler") {
		const wranglerConfig = getWranglerConfig(
			workerConfig,
			configurationResults
		);
		if (wranglerConfig !== null) {
			// `saveWranglerJsonc()` reconciles the Node.js compatibility flags itself,
			// once it has merged this with any config already on disk.
			await saveWranglerJsonc(autoConfigDetails.projectPath, wranglerConfig);
		}
	}

	if (target === "cf") {
		if (workerConfig !== null) {
			await saveCloudflareConfig(autoConfigDetails.projectPath, workerConfig);
		}
		if (
			configurationResults.buildTool === "wrangler" &&
			configurationResults.buildConfig
		) {
			await saveWranglerConfigTs(
				autoConfigDetails.projectPath,
				configurationResults.buildConfig
			);
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
 * Applies the common Worker defaults to framework-provided configuration.
 *
 * @param defaultWorkerConfig The common Worker configuration defaults
 * @param workerConfig The framework-provided Worker configuration
 * @returns The merged Worker configuration, or `null` when an external tool owns it
 */
function mergeWorkerConfig(
	defaultWorkerConfig: WorkerConfigInput,
	workerConfig: Partial<WorkerConfigInput> | null
): WorkerConfigInput | null {
	return workerConfig === null
		? null
		: { ...defaultWorkerConfig, ...workerConfig };
}

/**
 * Converts framework configuration results into the legacy Wrangler format.
 *
 * @param workerConfig The resolved Worker configuration
 * @param configurationResults The framework configuration results
 * @returns The Wrangler configuration, or `null` when an external tool owns it
 */
function getWranglerConfig(
	workerConfig: WorkerConfigInput | null,
	configurationResults: ConfigurationResults
): RawConfig | null {
	if (workerConfig === null) {
		return null;
	}

	const parsedWorkerConfig = InputWorkerSchema.parse({
		type: "worker",
		...workerConfig,
	});
	const convertedWranglerConfig = convertToWranglerConfig(parsedWorkerConfig);
	const wranglerConfig = ensureNodejsCompatIsEnabled({
		$schema: "node_modules/wrangler/config-schema.json",
		...convertedWranglerConfig,
		...(configurationResults.buildConfig?.assetsDirectory
			? {
					assets: {
						...convertedWranglerConfig.assets,
						directory: configurationResults.buildConfig.assetsDirectory,
					},
				}
			: {}),
	});

	return wranglerConfig;
}

/**
 * Given a wrangler config object this function makes sure that Node.js compatibility is enabled.
 *
 * From `NODEJS_COMPAT_DEFAULT_ON_DATE` the config's compatibility date is enough to enable it, and
 * specifying `nodejs_compat` as well is a workerd validation error, so the flag is only added for
 * earlier dates.
 *
 * Either way the function filters out any compatibility flag already present starting with
 * `nodejs_` (e.g. `nodejs_als`), so that a framework-provided flag cannot conflict with this.
 *
 * @param wranglerConfig The target wrangler config object
 * @returns A copy of the config object where Node.js compatibility is assured to be enabled
 */
function ensureNodejsCompatIsEnabled(wranglerConfig: RawConfig): RawConfig {
	const flags = (wranglerConfig.compatibility_flags ?? []).filter(
		(flag) => !flag.startsWith("nodejs_")
	);

	if (!isNodejsCompatDefaultOn(wranglerConfig.compatibility_date)) {
		flags.push("nodejs_compat");
	}

	if (flags.length === 0) {
		const { compatibility_flags: _removed, ...rest } = wranglerConfig;
		return rest;
	}

	return { ...wranglerConfig, compatibility_flags: flags };
}

/**
 * Saves the a wrangler.jsonc file for the current project potentially combining new values to the potential
 * pre-existing wrangler config file generated by the framework's CLI
 *
 * @param projectPath The project's path
 * @param baseWranglerConfig The wrangler config to use
 */
export async function saveWranglerJsonc(
	projectPath: string,
	wranglerConfig: RawConfig
): Promise<void> {
	let existingWranglerConfig: RawConfig = {};

	const wranglerConfigPath = getDirWranglerJsonConfigPath(projectPath);
	if (wranglerConfigPath) {
		const existingContent = await readFile(wranglerConfigPath, "utf8");
		existingWranglerConfig = parseJSONC(
			existingContent,
			wranglerConfigPath
		) as RawConfig;
	}

	// Reconcile the flags against the config that actually gets written. The
	// merge only overrides the keys we generate, so a `nodejs_compat` written by
	// the framework's own scaffolder would otherwise survive next to the
	// compatibility date we write over it — the combination workerd rejects.
	const mergedWranglerConfig = ensureNodejsCompatIsEnabled({
		...existingWranglerConfig,
		...wranglerConfig,
	});

	await writeFile(
		resolve(projectPath, "wrangler.jsonc"),
		JSON.stringify(mergedWranglerConfig, null, 2) + "\n"
	);
}

/**
 * Writes the Worker configuration used by `cf`.
 *
 * @param projectPath The project directory
 * @param workerConfig The Worker configuration to write
 */
async function saveCloudflareConfig(
	projectPath: string,
	workerConfig: WorkerConfigInput
): Promise<void> {
	await writeFile(
		resolve(projectPath, "cloudflare.config.ts"),
		renderCloudflareConfig(workerConfig)
	);
}

/**
 * Writes the Wrangler build-tool configuration used by `cf`.
 *
 * @param projectPath The project directory
 * @param buildConfig The build-tool configuration to write
 */
async function saveWranglerConfigTs(
	projectPath: string,
	buildConfig: BuildConfig
): Promise<void> {
	await writeFile(
		resolve(projectPath, "wrangler.config.ts"),
		renderWranglerConfigTs(buildConfig)
	);
}

/**
 * Renders a Worker configuration as a `cloudflare.config.ts` module.
 *
 * @param workerConfig The Worker configuration to render
 * @returns The configuration module source
 */
function renderCloudflareConfig(workerConfig: WorkerConfigInput): string {
	return `import { defineWorker } from "cf/config";\n\nexport default defineWorker(${JSON.stringify(workerConfig, null, 2)});\n`;
}

/**
 * Renders build-tool configuration as a `wrangler.config.ts` module.
 *
 * @param buildConfig The build-tool configuration to render
 * @returns The configuration module source
 */
function renderWranglerConfigTs(buildConfig: BuildConfig): string {
	return `import { defineWranglerConfig } from "wrangler/experimental-config";\n\nexport default defineWranglerConfig(${JSON.stringify(buildConfig, null, 2)});\n`;
}

/**
 * Indents rendered file content for display in the operation summary.
 *
 * @param content The file content to indent
 * @returns The indented content
 */
function indentFileContent(content: string): string {
	return "  " + content.trimEnd().replace(/\n/g, "\n  ");
}

/**
 * Builds a summary of all operations that autoconfig will (or did) perform,
 * including package installation, package.json script updates, configuration
 * creation, and framework-specific configuration.
 *
 * @param autoConfigDetails - The detected project details.
 * @param workerConfig - The resolved Worker configuration.
 * @param configurationResults - The framework configuration results.
 * @param projectCommands - The build, deploy, and version commands for the project.
 * @param enableTargetCliInstallation - Whether to install the selected target CLI package.
 * @param target - The configuration target.
 * @param context - The autoconfig context providing logger and other dependencies.
 * @param packageJsonScriptsOverrides - Optional overrides for package.json script entries.
 * @returns A summary object describing all planned operations.
 */
export async function buildOperationsSummary(
	autoConfigDetails: AutoConfigDetailsForNonConfiguredProject & {
		outputDir: NonNullable<AutoConfigDetails["outputDir"]>;
	},
	workerConfig: WorkerConfigInput | null,
	configurationResults: ConfigurationResults,
	projectCommands: {
		build?: string;
		deploy: string;
		version?: string;
	},
	enableTargetCliInstallation: boolean,
	target: AutoConfigTarget,
	context: AutoConfigContext,
	packageJsonScriptsOverrides?: PackageJsonScriptsOverrides
): Promise<AutoConfigSummary> {
	const { logger } = context;
	logger.log("");
	const wranglerConfig =
		target === "wrangler"
			? getWranglerConfig(workerConfig, configurationResults)
			: null;

	const summary: AutoConfigSummary = {
		scripts: {},
		...(target === "wrangler"
			? { wranglerConfig: wranglerConfig ?? undefined }
			: {
					workerConfig: workerConfig ?? undefined,
					buildConfig: configurationResults.buildConfig,
				}),
		outputDir: autoConfigDetails.outputDir,
		frameworkId: autoConfigDetails.framework.id,
		buildCommand: projectCommands.build,
		deployCommand: projectCommands.deploy,
		versionCommand: projectCommands.version,
	};

	const packagesToInstall = new Set<string>();
	if (autoConfigDetails.packageJson) {
		if (enableTargetCliInstallation) {
			packagesToInstall.add(target);
		}
		if (configurationResults.buildTool === "vite") {
			packagesToInstall.add("@cloudflare/vite-plugin");
		} else if (
			target === "cf" &&
			configurationResults.buildTool === "wrangler"
		) {
			packagesToInstall.add("wrangler");
		}
	}

	if (packagesToInstall.size > 0) {
		logger.log("📦 Install packages:");
		for (const packageName of packagesToInstall) {
			logger.log(` - ${packageName} (devDependency)`);
		}
		logger.log("");
	}

	if (autoConfigDetails.packageJson) {
		const scriptOverrides =
			target === "wrangler" ? packageJsonScriptsOverrides : undefined;
		const buildCommandPrefix = autoConfigDetails.buildCommand
			? `${autoConfigDetails.buildCommand} && `
			: "";
		summary.scripts = {
			deploy:
				scriptOverrides?.deploy ??
				`${buildCommandPrefix}${target} deploy${
					target === "cf" && autoConfigDetails.buildCommand ? " --no-build" : ""
				}`,
			preview:
				scriptOverrides?.preview ??
				`${target === "wrangler" ? buildCommandPrefix : ""}${target} dev`,
		};

		const containsServerSideCode =
			// If there is an entrypoint then we know that there is server side code
			!!workerConfig?.entrypoint;

		if (
			// If there is no server side code, then there is no need to add the cf-typegen script
			containsServerSideCode &&
			usesTypescript(autoConfigDetails.projectPath) &&
			!("cf-typegen" in (autoConfigDetails.packageJson.scripts ?? {}))
		) {
			summary.scripts["cf-typegen"] =
				scriptOverrides?.typegen ?? `${target} types`;
		}

		logger.log("📝 Update package.json scripts:");
		for (const [name, script] of Object.entries(summary.scripts)) {
			logger.log(` - "${name}": "${script}"`);
		}
		logger.log("");
	}

	if (target === "cf" && workerConfig) {
		logger.log("📄 Create cloudflare.config.ts:");
		logger.log(indentFileContent(renderCloudflareConfig(workerConfig)));
		logger.log("");
	}

	if (
		target === "cf" &&
		configurationResults.buildTool === "wrangler" &&
		configurationResults.buildConfig
	) {
		logger.log("📄 Create wrangler.config.ts:");
		logger.log(
			indentFileContent(
				renderWranglerConfigTs(configurationResults.buildConfig)
			)
		);
		logger.log("");
	}

	if (target === "wrangler" && wranglerConfig) {
		const wranglerConfigPath = resolve(
			autoConfigDetails.projectPath,
			"wrangler.jsonc"
		);
		const configExists = existsSync(wranglerConfigPath);
		logger.log(
			configExists ? "📄 Update wrangler.jsonc:" : "📄 Create wrangler.jsonc:"
		);
		logger.log(
			"  " + JSON.stringify(wranglerConfig, null, 2).replace(/\n/g, "\n  ")
		);
		logger.log("");
	}

	if (
		autoConfigDetails.framework &&
		!(autoConfigDetails.framework instanceof Static) &&
		!autoConfigDetails.framework.isConfigured(autoConfigDetails.projectPath, {
			target,
		})
	) {
		summary.frameworkConfiguration =
			autoConfigDetails.framework.configurationDescription ??
			`Configuring project for ${autoConfigDetails.framework.name}`;

		logger.log(`🛠️  ${summary.frameworkConfiguration}`);
		logger.log("");
	}

	return summary;
}

/**
 * Gets the path to the wrangler config file, in jsonc or json format, if present in a target directory.
 *
 * @param dir The target directory
 * @returns The path to the wrangler config file if present, `undefined` otherwise
 */
function getDirWranglerJsonConfigPath(dir: string): string | undefined {
	const filePathJsonC = resolve(dir, "wrangler.jsonc");
	if (existsSync(filePathJsonC)) {
		return filePathJsonC;
	}

	const filePathJson = resolve(dir, "wrangler.json");
	if (existsSync(filePathJson)) {
		return filePathJson;
	}

	return undefined;
}
