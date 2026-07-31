import assert from "node:assert";
import { existsSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
	maybeAppendWranglerToGitIgnoreLikeFile,
	maybeAppendWranglerToGitIgnore,
} from "@cloudflare/cli-shared-helpers/gitignore";
import { installWrangler } from "@cloudflare/cli-shared-helpers/packages";
import {
	FatalError,
	getTodaysCompatDate,
	parseJSONC,
	parseTOML,
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
	assertNonConfigured(autoConfigDetails);
	assertExistingConfigIsInProject(autoConfigDetails);

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
	assertExistingConfigIsInProject(autoConfigDetails);

	const packageJsonWillBeCreated =
		autoConfigDetails.framework.requiresPackageJson &&
		autoConfigDetails.packageJson === undefined;

	if (isKnownFramework(autoConfigDetails.framework.id)) {
		const frameworkIsSupported = isFrameworkSupported(
			autoConfigDetails.framework.id
		);
		if (!frameworkIsSupported) {
			throw new FatalError(
				`The detected framework ("${autoConfigDetails.framework.name}") cannot be automatically configured.`,
				{ telemetryMessage: "autoconfig run framework unsupported" }
			);
		}
	}

	assert(
		autoConfigDetails.outputDir,
		"The Output Directory is unexpectedly missing"
	);

	const compatibilityDate = getTodaysCompatDate();

	const {
		pages_build_output_dir: _pagesBuildOutputDir,
		...existingPagesConfig
	} =
		autoConfigDetails.framework.id === "cloudflare-pages"
			? (autoConfigDetails.existingWranglerConfig ?? {})
			: {};

	const wranglerConfig: RawConfig = {
		...existingPagesConfig,
		$schema: "node_modules/wrangler/config-schema.json",
		name: autoConfigDetails.workerName,
		compatibility_date:
			existingPagesConfig.compatibility_date ?? compatibilityDate,
		observability: existingPagesConfig.observability ?? { enabled: true },
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
			existingWranglerConfig: autoConfigDetails.existingWranglerConfig,
			context,
		});

	const { npx } = packageManager;

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
				`${npx} wrangler deploy`,
			version:
				dryRunConfigurationResults?.versionCommandOverride ??
				`${npx} wrangler versions upload`,
		},
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

	const {
		existingWranglerConfig: _existingWranglerConfig,
		...autoConfigDetailsForLogging
	} = autoConfigDetails;
	logger.debug(
		`Running autoconfig with:\n${JSON.stringify(autoConfigDetailsForLogging, null, 2)}...`
	);

	if (packageJsonWillBeCreated) {
		await writeFile(
			resolve(autoConfigDetails.projectPath, "package.json"),
			JSON.stringify(
				{
					name: autoConfigDetails.workerName,
					private: true,
					type: "module",
				} satisfies PackageJSON & { type: "module" },
				null,
				2
			) + "\n"
		);
	}

	if (autoConfigSummary.wranglerInstall && enableWranglerInstallation) {
		await installWrangler(packageManager.type, isWorkspaceRoot);
	}

	const configurationResults = await autoConfigDetails.framework.configure({
		outputDir: autoConfigDetails.outputDir,
		projectPath: autoConfigDetails.projectPath,
		workerName: autoConfigDetails.workerName,
		isWorkspaceRoot,
		dryRun: false,
		packageManager,
		existingWranglerConfig: autoConfigDetails.existingWranglerConfig,
		context,
	});

	if (autoConfigDetails.packageJson || packageJsonWillBeCreated) {
		const packageJsonPath = resolve(
			autoConfigDetails.projectPath,
			"package.json"
		);
		const existingPackageJson = JSON.parse(
			await readFile(packageJsonPath, "utf8")
		) as PackageJSON;

		const mergedScripts = {
			...existingPackageJson.scripts,
			...autoConfigSummary.scripts,
		};

		await writeFile(
			packageJsonPath,
			JSON.stringify(
				{
					...existingPackageJson,
					scripts:
						autoConfigDetails.framework.id === "cloudflare-pages"
							? replacePagesCommandsInScripts(mergedScripts)
							: mergedScripts,
				} satisfies PackageJSON,
				null,
				2
			) + "\n"
		);
	}

	if (configurationResults.wranglerConfig !== null) {
		await saveWranglerJsonc(
			autoConfigDetails.projectPath,
			autoConfigDetails.existingWranglerConfigPath,
			ensureNodejsCompatIsInConfig({
				...wranglerConfig,
				...configurationResults.wranglerConfig,
			})
		);
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
 * Prevents a Pages migration from replacing or deleting a Wrangler config
 * discovered outside the selected project root.
 *
 * @param autoConfigDetails The detected project and existing config details.
 */
function assertExistingConfigIsInProject(
	autoConfigDetails: AutoConfigDetailsForNonConfiguredProject
): void {
	const configPath = autoConfigDetails.existingWranglerConfigPath;
	if (
		configPath &&
		dirname(resolve(configPath)) !== resolve(autoConfigDetails.projectPath)
	) {
		throw new FatalError(
			"Cannot automatically migrate this Pages project because its Wrangler configuration is outside the project directory. Run the command from the directory containing the Wrangler configuration or migrate the project manually.",
			{ telemetryMessage: "autoconfig pages config outside project" }
		);
	}
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
 * Saves a wrangler.jsonc file for the current project, potentially combining new values with the
 * pre-existing wrangler config file (either generated by the framework's CLI or being migrated from
 * a Pages project). When the existing config file is in a different format or location (e.g. a
 * `wrangler.toml` being migrated) it is removed after the new `wrangler.jsonc` has been written.
 *
 * @param projectPath The project's path
 * @param existingWranglerConfigPath The path to the existing wrangler config file to merge and
 *   replace, if any (falls back to a config file discovered in `projectPath`)
 * @param wranglerConfig The wrangler config to use
 */
async function saveWranglerJsonc(
	projectPath: string,
	existingWranglerConfigPath: string | undefined,
	wranglerConfig: RawConfig
): Promise<void> {
	let existingWranglerConfig: RawConfig = {};

	const wranglerConfigPath =
		existingWranglerConfigPath ?? getDirWranglerConfigPath(projectPath);
	if (wranglerConfigPath) {
		const existingContent = await readFile(wranglerConfigPath, "utf8");
		existingWranglerConfig = (
			wranglerConfigPath.endsWith(".toml")
				? parseTOML(existingContent, wranglerConfigPath)
				: parseJSONC(existingContent, wranglerConfigPath)
		) as RawConfig;
	}
	const { pages_build_output_dir: _pagesBuildOutputDir, ...migratedConfig } = {
		...existingWranglerConfig,
		...wranglerConfig,
	};

	const outputPath = resolve(projectPath, "wrangler.jsonc");
	await writeFile(outputPath, JSON.stringify(migratedConfig, null, 2) + "\n");

	if (wranglerConfigPath && resolve(wranglerConfigPath) !== outputPath) {
		await unlink(wranglerConfigPath);
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
	packageJsonScriptsOverrides?: PackageJsonScriptsOverrides
): Promise<AutoConfigSummary> {
	const { logger } = context;
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
		...(autoConfigDetails.framework.requiresPackageJson &&
		autoConfigDetails.packageJson === undefined
			? { packageJsonCreated: true }
			: {}),
	};

	if (
		autoConfigDetails.packageJson ||
		autoConfigDetails.framework.requiresPackageJson
	) {
		// If there is a package.json file we will want to install wrangler
		summary.wranglerInstall = true;

		logger.log("📦 Install packages:");
		logger.log(` - wrangler (devDependency)`);
		logger.log("");

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
			!("cf-typegen" in (autoConfigDetails.packageJson?.scripts ?? {}))
		) {
			summary.scripts["cf-typegen"] =
				packageJsonScriptsOverrides?.typegen ?? "wrangler types";
		}

		logger.log("📝 Update package.json scripts:");
		for (const [name, script] of Object.entries(summary.scripts)) {
			logger.log(` - "${name}": "${script}"`);
		}
		logger.log("");
	}

	if (wranglerConfigToWrite) {
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

/**
 * Replaces legacy `wrangler pages dev` and `wrangler pages deploy` commands
 * with their Workers equivalents (`wrangler dev` and `wrangler deploy`) in
 * every string-valued script entry.
 *
 * @param scripts The package.json `scripts` object to process.
 * @returns A copy of the scripts with pages commands replaced.
 */
export function replacePagesCommandsInScripts(
	scripts: Record<string, unknown>
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(scripts)) {
		if (typeof value === "string") {
			result[key] = value
				.replace(/\bwrangler pages dev\b/g, "wrangler dev")
				.replace(/\bwrangler pages deploy\b/g, "wrangler deploy");
		} else {
			result[key] = value;
		}
	}
	return result;
}

/**
 * Gets the path to the wrangler config file, in jsonc or json format, if present in a target directory.
 *
 * @param dir The target directory
 * @returns The path to the wrangler config file if present, `undefined` otherwise
 */
function getDirWranglerConfigPath(dir: string): string | undefined {
	const filePathJsonC = resolve(dir, "wrangler.jsonc");
	if (existsSync(filePathJsonC)) {
		return filePathJsonC;
	}

	const filePathJson = resolve(dir, "wrangler.json");
	if (existsSync(filePathJson)) {
		return filePathJson;
	}

	const filePathToml = resolve(dir, "wrangler.toml");
	if (existsSync(filePathToml)) {
		return filePathToml;
	}

	return undefined;
}
