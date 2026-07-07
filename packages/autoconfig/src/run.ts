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
import {
	FatalError,
	getTodaysCompatDate,
	parseJSONC,
} from "@cloudflare/workers-utils";
import {
	assertNonConfigured,
	confirmAutoConfigDetails,
	displayAutoConfigDetails,
} from "./details";
import { ensureDirectoryForFile } from "./details/project-adapters";
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

	if (autoConfigDetails.configurationPlan) {
		return await runConfigurationPlan(autoConfigDetails, autoConfigOptions);
	}
	const framework = autoConfigDetails.framework;
	assert(framework, "The framework is unexpectedly missing");

	if (isKnownFramework(framework.id)) {
		const frameworkIsSupported = isFrameworkSupported(framework.id);
		if (!frameworkIsSupported) {
			throw new FatalError(
				framework.id === "cloudflare-pages"
					? `The target project seems to be using Cloudflare Pages. Automatically migrating from a Pages project to Workers is not yet supported.`
					: `The detected framework ("${framework.name}") cannot be automatically configured.`,
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

	const frameworkPackageInfo = getFrameworkPackageInfo(framework.id);
	if (frameworkPackageInfo) {
		framework.validateFrameworkVersion(
			autoConfigDetails.projectPath,
			frameworkPackageInfo,
			context
		);
	}

	const dryRunConfigurationResults = await framework.configure({
		outputDir: autoConfigDetails.outputDir,
		projectPath: autoConfigDetails.projectPath,
		workerName: autoConfigDetails.workerName,
		isWorkspaceRoot,
		dryRun: true,
		packageManager,
		context,
	});

	const { npx } = packageManager;

	const autoConfigSummary = await buildOperationsSummary(
		{ ...autoConfigDetails, outputDir: autoConfigDetails.outputDir, framework },
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
		dryRunConfigurationResults.packageJsonScriptsOverrides,
		enableWranglerInstallation
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
		logger.log(`✋  ${"Autoconfig process run in dry-run mode, exiting now."}`);
		logger.log("");

		return autoConfigSummary;
	}

	logger.debug(
		`Running autoconfig with:\n${JSON.stringify(autoConfigDetails, null, 2)}...`
	);

	if (autoConfigSummary.wranglerInstall && enableWranglerInstallation) {
		await installWrangler(packageManager.type, isWorkspaceRoot);
	}

	const configurationResults = await framework.configure({
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
		await saveWranglerJsonc(
			autoConfigDetails.projectPath,
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

async function runConfigurationPlan(
	autoConfigDetails: AutoConfigDetailsForNonConfiguredProject,
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
	const plan = autoConfigDetails.configurationPlan;
	assert(plan, "Expected configuration plan to be present");

	const wranglerConfigToWrite = getConfigurationPlanWranglerConfig(
		plan.wranglerConfig,
		autoConfigDetails.workerName
	);
	const autoConfigSummary = buildConfigurationPlanSummary(
		autoConfigDetails,
		wranglerConfigToWrite,
		context,
		enableWranglerInstallation
	);

	if (
		plan.mode === "persistent" &&
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
		logger.log(`✋  ${"Autoconfig process run in dry-run mode, exiting now."}`);
		logger.log("");

		return autoConfigSummary;
	}

	const isWorkspaceRoot = autoConfigDetails.isWorkspaceRoot ?? false;

	if (autoConfigSummary.wranglerInstall && enableWranglerInstallation) {
		await installWrangler(
			autoConfigDetails.packageManager.type,
			isWorkspaceRoot
		);
	}

	if (plan.dependencies?.length) {
		const dependencyGroups = new Map<boolean, string[]>();
		for (const dependency of plan.dependencies) {
			const dev = dependency.dev ?? false;
			dependencyGroups.set(dev, [
				...(dependencyGroups.get(dev) ?? []),
				dependency.name,
			]);
		}

		for (const [dev, dependencies] of dependencyGroups) {
			await installPackages(
				autoConfigDetails.packageManager.type,
				dependencies,
				{
					dev,
					isWorkspaceRoot,
				}
			);
		}
	}

	if (plan.filesToCreate?.length) {
		for (const file of plan.filesToCreate) {
			const filePath = resolve(autoConfigDetails.projectPath, file.path);
			if (existsSync(filePath)) {
				throw new FatalError(
					`Refusing to overwrite generated file ${file.path}. Move or remove it and try again.`,
					{ telemetryMessage: "autoconfig run generated file exists" }
				);
			}
			await ensureDirectoryForFile(filePath);
			await writeFile(filePath, file.contents);
		}
	}

	if (autoConfigDetails.packageJson && plan.packageJsonScripts) {
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

	if (wranglerConfigToWrite && plan.mode === "persistent") {
		await saveWranglerJsonc(
			autoConfigDetails.projectPath,
			wranglerConfigToWrite
		);
	}

	if (plan.mode === "persistent") {
		maybeAppendWranglerToGitIgnore(autoConfigDetails.projectPath);
	}

	for (const command of plan.commands ?? []) {
		if (command.when === "setup" || (command.when === "build" && runBuild)) {
			await context.runCommand(
				command.command,
				autoConfigDetails.projectPath,
				`[${command.label ?? command.when}]`
			);
		}
	}

	return autoConfigSummary;
}

function buildConfigurationPlanSummary(
	autoConfigDetails: AutoConfigDetailsForNonConfiguredProject,
	wranglerConfigToWrite: RawConfig | null | undefined,
	context: AutoConfigContext,
	enableWranglerInstallation: boolean
): AutoConfigSummary {
	const { logger } = context;
	const plan = autoConfigDetails.configurationPlan;
	assert(plan, "Expected configuration plan to be present");
	logger.log("");

	const summary: AutoConfigSummary = {
		wranglerInstall:
			enableWranglerInstallation &&
			plan.mode === "persistent" &&
			Boolean(autoConfigDetails.packageJson),
		scripts: plan.packageJsonScripts ?? {},
		...(wranglerConfigToWrite ? { wranglerConfig: wranglerConfigToWrite } : {}),
		outputDir: autoConfigDetails.outputDir,
		buildCommand: autoConfigDetails.buildCommand,
		projectKind: autoConfigDetails.projectKind,
		adapterId: autoConfigDetails.adapterId,
		adapterName: autoConfigDetails.adapterName,
		confidence: autoConfigDetails.confidence,
		deployMode: plan.mode,
		sourceCategory: autoConfigDetails.sourceCategory,
		evidence: autoConfigDetails.evidence,
		warnings: plan.warnings,
		generatedFiles: plan.generatedFiles,
		deploy: plan.deploy,
		summaryFields: plan.summaryFields,
	};

	if (plan.mode === "no-write") {
		logger.log("📝 No local project files will be written.");
		logger.log("");
	}

	if (summary.wranglerInstall || plan.dependencies?.length) {
		logger.log("📦 Install packages:");
		if (summary.wranglerInstall) {
			logger.log(` - wrangler (devDependency)`);
		}
		for (const dependency of plan.dependencies ?? []) {
			logger.log(
				` - ${dependency.name}${dependency.dev ? " (devDependency)" : ""}`
			);
		}
		logger.log("");
	}

	if (Object.keys(summary.scripts).length > 0) {
		logger.log("📝 Update package.json scripts:");
		for (const [name, script] of Object.entries(summary.scripts)) {
			logger.log(` - "${name}": "${script}"`);
		}
		logger.log("");
	}

	if (plan.filesToCreate?.length) {
		logger.log("📄 Create files:");
		for (const file of plan.filesToCreate) {
			logger.log(` - ${file.path}`);
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

	if (plan.commands?.length) {
		logger.log("🏗️  Run commands:");
		for (const command of plan.commands) {
			logger.log(` - ${command.command}`);
		}
		logger.log("");
	}

	return summary;
}

function getConfigurationPlanWranglerConfig(
	wranglerConfig: RawConfig | null | undefined,
	workerName: string
): RawConfig | null | undefined {
	if (!wranglerConfig) {
		return wranglerConfig;
	}

	return {
		...wranglerConfig,
		name: workerName,
		containers: wranglerConfig.containers?.map((container) => ({
			...container,
			name:
				container.name === wranglerConfig.name ? workerName : container.name,
		})),
	};
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

	const wranglerConfigPath = getDirWranglerJsonConfigPath(projectPath);
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
		framework: NonNullable<AutoConfigDetails["framework"]>;
	},
	wranglerConfigToWrite: RawConfig | null,
	projectCommands: {
		build?: string;
		deploy: string;
		version?: string;
	},
	context: AutoConfigContext,
	packageJsonScriptsOverrides?: PackageJsonScriptsOverrides,
	enableWranglerInstallation = true
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
	};

	if (autoConfigDetails.packageJson) {
		if (enableWranglerInstallation) {
			// If there is a package.json file we will want to install wrangler
			summary.wranglerInstall = true;

			logger.log("📦 Install packages:");
			logger.log(` - wrangler (devDependency)`);
			logger.log("");
		}

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
