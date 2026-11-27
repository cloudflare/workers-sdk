import assert from "node:assert";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
	maybeAppendWranglerToGitIgnoreLikeFile,
	maybeAppendWranglerToGitIgnore,
	PROJECT_ROOT_ASSETS_IGNORE_ENTRIES,
} from "@cloudflare/cli-shared-helpers/gitignore";
import {
	installPackages,
	installWrangler,
} from "@cloudflare/cli-shared-helpers/packages";
import {
	convertToWranglerConfig,
	CloudflareConfigSchema,
} from "@cloudflare/config";
import {
	DEFAULT_COMPAT_DATE,
	FatalError,
	isNodejsCompatDefaultOn,
	parseJSONC,
	toValidWorkerName,
} from "@cloudflare/workers-utils";
import * as find from "empathic/find";
import { getScaffoldedProjectAssetsIgnoreEntries } from "./assets-ignore";
import {
	assertNonConfigured,
	assertProjectCommandsAvailable,
	confirmAutoConfigDetails,
	displayAutoConfigDetails,
	getProjectCommand,
	getDetailsForAutoConfig,
} from "./details";
import {
	getViteRunner,
	readWorkspacePackage,
	resolveViteRunnerExecutable,
} from "./details/vite-commands";
import {
	isFrameworkSupported,
	isKnownFramework,
	type PackageJsonScriptsOverrides,
	validateFrameworkTargetSupport,
} from "./frameworks";
import { getFrameworkPackageInfo } from "./frameworks/all-frameworks";
import { Static } from "./frameworks/static";
import {
	CF_VITE_PLUGIN_VERSION_RANGE,
	CF_VITE_VERSION_RANGE,
} from "./frameworks/utils/vite-plugin-version";
import {
	CLOUDFLARE_TYPES_INCLUDE,
	getCloudflareTypesTsconfigUpdate,
	saveCloudflareTsconfig,
	saveCloudflareTypesTsconfigUpdate,
} from "./tsconfig";
import { usesTypescript } from "./uses-typescript";
import type { AutoConfigContext, AutoConfigTarget } from "./context";
import type { ViteRunner } from "./details/vite-commands";
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
import type { WorkerConfig } from "@cloudflare/config";
import type { PackageJSON } from "@cloudflare/workers-utils";
import type { RawConfig } from "@cloudflare/workers-utils/config";

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
		dryRun ||
		autoConfigOptions.skipConfirmations === true ||
		(target === "cf" && context.isNonInteractiveOrCI?.() === true);
	const enableTargetCliInstallation =
		autoConfigOptions.enableTargetCliInstallation ?? true;

	assertNonConfigured(autoConfigDetails);

	displayAutoConfigDetails(autoConfigDetails, context);

	const updatedAutoConfigDetails = skipConfirmations
		? autoConfigDetails
		: await confirmAutoConfigDetails(autoConfigDetails, context, target);

	if (autoConfigDetails !== updatedAutoConfigDetails) {
		displayAutoConfigDetails(updatedAutoConfigDetails, context, {
			heading: "Updated Project Settings:",
		});
	}

	autoConfigDetails = updatedAutoConfigDetails;
	assertNonConfigured(autoConfigDetails);
	validateFrameworkTargetSupport(autoConfigDetails.framework, target);

	if (isKnownFramework(autoConfigDetails.framework.id, target)) {
		const frameworkIsSupported = isFrameworkSupported(
			autoConfigDetails.framework.id,
			target
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

	const defaultWorkerConfig: WorkerConfig = {
		name: autoConfigDetails.workerName,
		compatibilityDate,
		observability: {
			enabled: true,
		},
	};

	const { packageManager } = autoConfigDetails;
	const isWorkspaceRoot = autoConfigDetails.isWorkspaceRoot ?? false;

	const frameworkPackageInfo = getFrameworkPackageInfo(
		autoConfigDetails.framework.id,
		target
	);
	const workspaceVite = getWorkspaceVite(autoConfigDetails, target);
	const validateViteAfterInstall = needsViteInstall(
		autoConfigDetails,
		target,
		workspaceVite
	);
	if (frameworkPackageInfo && !validateViteAfterInstall) {
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
			wranglerConfigPath: autoConfigDetails.wranglerConfigPath,
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

	const scaffold = getCfProjectScaffold(
		autoConfigDetails,
		dryRunConfigurationResults,
		target,
		workspaceVite
	);
	const { npx } = packageManager;
	let buildCommand =
		dryRunConfigurationResults.buildCommandOverride ??
		autoConfigDetails.buildCommand ??
		(autoConfigDetails.commandError && autoConfigDetails.framework.id === "vite"
			? "vite build"
			: undefined);
	// Preserve shell commands while normalizing Vite selected by framework overrides.
	if (buildCommand === "vite build" || buildCommand === `${npx} vite build`) {
		buildCommand = getProjectCommand(
			buildCommand,
			packageManager,
			scaffold?.workspaceVite?.packageJson ?? autoConfigDetails.packageJson,
			target
		);
	}

	const autoConfigSummary = await buildOperationsSummary(
		{ ...autoConfigDetails, outputDir: autoConfigDetails.outputDir },
		dryRunWorkerConfig,
		dryRunConfigurationResults,
		{
			build: buildCommand,
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

	if (dryRun) {
		logger.log(`✋  ${"Autoconfig process run in dry-run mode, exiting now."}`);
		logger.log("");

		return autoConfigSummary;
	}

	if (!skipConfirmations) {
		const newProjectFiles = [
			scaffold?.createPackageJson && "package.json",
			scaffold?.createTsconfig === "required"
				? "tsconfig.json"
				: scaffold?.createTsconfig === "fallback" &&
					"tsconfig.json (if the framework doesn't create one)",
		].filter(Boolean);
		const confirmed =
			newProjectFiles.length > 0
				? await context.dialogs.confirm(
						`Proceed with setup and create ${newProjectFiles.join(" and ")}${scaffold?.createTsconfig === "fallback" ? " and install TypeScript if needed" : ""}?`,
						{ defaultValue: true, fallbackValue: true }
					)
				: await context.dialogs.confirm("Proceed with setup?");
		if (!confirmed) {
			throw new FatalError("Setup cancelled", {
				telemetryMessage: "autoconfig run setup cancelled",
			});
		}
	}

	logger.debug(
		`Running autoconfig with:\n${JSON.stringify(autoConfigDetails, null, 2)}...`
	);

	const { projectPath, packageJson } = autoConfigDetails;
	const packageJsonPath = resolve(projectPath, "package.json");
	if (scaffold?.createPackageJson) {
		const manifest = {
			name: toValidWorkerName(
				autoConfigDetails.workerName
					.trim()
					.toLowerCase()
					.replaceAll(/\s+/g, "-")
			),
			private: true,
			type: "module",
		};
		await writeFile(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`, {
			flag: "wx",
		});
	}

	const hasPackageJson =
		packageJson !== undefined || scaffold?.createPackageJson;
	if (hasPackageJson) {
		if (target === "cf") {
			const packages = getCfPackagesToInstall(
				packageJson,
				enableTargetCliInstallation,
				scaffold
			);
			const workspaceViteRoot = scaffold?.workspaceVite?.root;
			if (
				packages.length > 0 ||
				(validateViteAfterInstall && !workspaceViteRoot)
			) {
				await installPackages(packageManager.type, packages, {
					cwd: projectPath,
					dev: true,
					isWorkspaceRoot,
				});
			}
			if (
				workspaceViteRoot &&
				needsViteInstall(autoConfigDetails, target, workspaceVite)
			) {
				await installPackages(packageManager.type, [], {
					cwd: workspaceViteRoot,
				});
			}
			if (dryRunConfigurationResults.buildTool === "wrangler") {
				await installWrangler(
					packageManager.type,
					isWorkspaceRoot,
					projectPath
				);
			}
		} else if (enableTargetCliInstallation) {
			await installWrangler(packageManager.type, isWorkspaceRoot);
		}
	}

	if (frameworkPackageInfo && validateViteAfterInstall) {
		autoConfigDetails.framework.validateFrameworkVersion(
			projectPath,
			frameworkPackageInfo,
			context
		);
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
		wranglerConfigPath: autoConfigDetails.wranglerConfigPath,
	});
	const workerConfig = mergeWorkerConfig(
		defaultWorkerConfig,
		configurationResults.workerConfig
	);

	if (hasPackageJson) {
		const existingPackageJson = JSON.parse(
			await readFile(packageJsonPath, "utf8")
		) as PackageJSON;
		const existingScripts = existingPackageJson.scripts ?? {};
		const scriptsToAdd = Object.fromEntries(
			Object.entries(autoConfigSummary.scripts).filter(
				([name]) => target === "wrangler" || !(name in existingScripts)
			)
		);
		autoConfigSummary.scripts = scriptsToAdd;

		if (Object.keys(scriptsToAdd).length > 0) {
			await writeFile(
				packageJsonPath,
				JSON.stringify(
					{
						...existingPackageJson,
						scripts: {
							...existingScripts,
							...scriptsToAdd,
						},
					} satisfies PackageJSON,
					null,
					2
				) + "\n"
			);
		}
		if (
			scaffold?.createTsconfig === "fallback" &&
			!hasProjectDependency(existingPackageJson, "typescript")
		) {
			const typescriptPackage =
				autoConfigDetails.framework.id === "astro"
					? "typescript@^6"
					: "typescript";
			await installPackages(packageManager.type, [typescriptPackage], {
				cwd: projectPath,
				dev: true,
				isWorkspaceRoot,
			});
		}
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
		if (scaffold?.createTsconfig && !usesTypescript(projectPath)) {
			await saveCloudflareTsconfig(
				projectPath,
				Boolean(workerConfig?.entrypoint)
			);
		} else if (workerConfig?.entrypoint) {
			await saveCloudflareTypesTsconfigUpdate(projectPath, context);
		}
		if (
			configurationResults.buildTool === "wrangler" &&
			configurationResults.buildConfig
		) {
			await saveWranglerConfigTs(projectPath, configurationResults.buildConfig);
		}
	}

	if (scaffold) {
		const gitIgnorePath = resolve(projectPath, ".gitignore");
		if (existsSync(gitIgnorePath) || find.up(".git", { cwd: projectPath })) {
			maybeAppendWranglerToGitIgnoreLikeFile(gitIgnorePath, {
				additionalEntries: [".cloudflare/", "node_modules/"],
			});
		}
	} else {
		maybeAppendWranglerToGitIgnore(projectPath);
	}

	// If the project root is the assets directory, make sure we don't
	// accidentally upload sensitive files or anything a Cloudflare Pages upload
	// would have skipped. Compare the assets directory the generated config uses
	// rather than the detected output directory: frameworks such as Nuxt
	// configure their own build output, and the uploader only reads the
	// `.assetsignore` inside the assets directory. Paths are resolved because the
	// configured directory is relative (e.g. ".") while projectPath is usually
	// absolute.
	const assetsDirectory = configurationResults.buildConfig?.assetsDirectory;
	if (
		assetsDirectory !== undefined &&
		resolve(autoConfigDetails.projectPath, assetsDirectory) ===
			resolve(autoConfigDetails.projectPath)
	) {
		maybeAppendWranglerToGitIgnoreLikeFile(
			`${autoConfigDetails.projectPath}/.assetsignore`,
			{
				additionalEntries: scaffold
					? getScaffoldedProjectAssetsIgnoreEntries(packageManager.lockFiles)
					: PROJECT_ROOT_ASSETS_IGNORE_ENTRIES,
				requireEnvWildcard: true,
			}
		);

		// In an assets-only project, Pages server code at the root is now excluded
		// from the assets rather than published, but it is not deployed as a
		// Worker either, so say so. With a Worker entrypoint, a root `_worker.js`
		// may be the framework's own build output.
		const pagesServerCode = workerConfig?.entrypoint
			? []
			: ["functions", "_worker.js"].filter((name) =>
					existsSync(resolve(autoConfigDetails.projectPath, name))
				);
		if (pagesServerCode.length > 0) {
			context.logger.warn(
				`${pagesServerCode.map((name) => `\`${name}\``).join(" and ")} in the project root will not be deployed: the project is configured as static assets, so Pages server code is excluded from the upload (via .assetsignore) and is not run. To keep it, migrate it to a Worker: https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/`
			);
		}
	}

	if (target === "cf" && workerConfig !== null) {
		await saveCloudflareConfig(projectPath, workerConfig);
	}

	// Setup can install missing packages or activate the plugin. Recheck command
	// readiness after those changes, only when a build will actually be executed.
	if (target === "cf" && runBuild && autoConfigDetails.commandError) {
		const configuredDetails = await getDetailsForAutoConfig({
			projectPath: autoConfigDetails.projectPath,
			target,
			context,
		});
		assertProjectCommandsAvailable(configuredDetails);
		buildCommand =
			configurationResults.buildCommandOverride ??
			configuredDetails.buildCommand ??
			buildCommand;
		if (buildCommand === "vite build" || buildCommand === `${npx} vite build`) {
			const configuredPackageJson = configuredDetails.packageJson;
			buildCommand = getProjectCommand(
				buildCommand,
				packageManager,
				getViteRunner(configuredPackageJson)
					? configuredPackageJson
					: (scaffold?.workspaceVite?.packageJson ?? configuredPackageJson),
				target
			);
		}
		autoConfigSummary.buildCommand = buildCommand;
	}
	if (buildCommand && runBuild) {
		await context.runCommand(
			buildCommand,
			autoConfigDetails.projectPath,
			"[build]"
		);
	}

	return autoConfigSummary;
}

/** Determines whether cf must install the selected runner or its Vite core before validating the Vite version. */
function needsViteInstall(
	{
		framework,
		packageJson,
		projectPath,
		nodeModulesPaths = [resolve(projectPath, "node_modules")],
	}: AutoConfigDetailsForNonConfiguredProject,
	target: AutoConfigTarget,
	workspaceVite?: WorkspaceVite
): boolean {
	if (target !== "cf" || framework.id !== "vite") {
		return false;
	}
	const runner = getViteRunner(packageJson) ?? workspaceVite?.runner ?? "vite";
	return (
		!resolveViteRunnerExecutable(nodeModulesPaths, runner) ||
		!nodeModulesPaths.some((directory) =>
			existsSync(resolve(directory, "vite", "package.json"))
		)
	);
}

type WorkspaceVite = {
	root: string;
	runner: ViteRunner;
	packageJson: PackageJSON;
};

/** Finds the workspace's runner when the application has not declared its own. */
function getWorkspaceVite(
	{ packageJson, workspaceRoot }: AutoConfigDetailsForNonConfiguredProject,
	target: AutoConfigTarget
): WorkspaceVite | undefined {
	if (target !== "cf" || !workspaceRoot || getViteRunner(packageJson)) {
		return;
	}
	const workspacePackageJson = readWorkspacePackage(workspaceRoot);
	const runner = getViteRunner(workspacePackageJson);
	if (workspacePackageJson && runner) {
		return { root: workspaceRoot, runner, packageJson: workspacePackageJson };
	}
}

type CfProjectScaffold = {
	createPackageJson: boolean;
	createTsconfig?: "required" | "fallback";
	installVite: boolean;
	workspaceVite?: WorkspaceVite;
};

/** Plans the supporting files and local Vite runner when setup generates a Cloudflare config. */
function getCfProjectScaffold(
	{
		packageJson,
		projectPath,
		nodeModulesPaths,
	}: AutoConfigDetailsForNonConfiguredProject,
	{ workerConfig, createsCloudflareConfig, buildTool }: ConfigurationResults,
	target: AutoConfigTarget,
	workspaceVite: WorkspaceVite | undefined
): CfProjectScaffold | undefined {
	if (target !== "cf" || (workerConfig === null && !createsCloudflareConfig)) {
		return;
	}

	const createPackageJson = packageJson === undefined;
	if (createPackageJson && existsSync(resolve(projectPath, "package.json"))) {
		throw new FatalError(
			"The existing package.json could not be read. Fix it before running autoconfig again.",
			{ telemetryMessage: "autoconfig invalid package json" }
		);
	}
	if (
		workerConfig !== null &&
		packageJson &&
		"type" in packageJson &&
		packageJson.type === "commonjs"
	) {
		throw new FatalError(
			'Cannot generate cloudflare.config.ts in a package with "type": "commonjs". Convert the package to ESM (moving any remaining CommonJS files to .cjs) before running autoconfig again.',
			{ telemetryMessage: "autoconfig commonjs package unsupported" }
		);
	}
	const usesVite = buildTool === "vite";
	return {
		createPackageJson,
		createTsconfig: usesTypescript(projectPath)
			? undefined
			: workerConfig === null
				? "fallback"
				: "required",
		workspaceVite: usesVite ? workspaceVite : undefined,
		installVite:
			usesVite &&
			workerConfig !== null &&
			!getViteRunner(packageJson) &&
			!workspaceVite &&
			!resolveViteRunnerExecutable(nodeModulesPaths?.slice(1) ?? [], "vite"),
	};
}

/** Checks whether the project already declares a dependency. */
function hasProjectDependency(
	packageJson: PackageJSON | undefined,
	name: string
): boolean {
	return (
		name in (packageJson?.dependencies ?? {}) ||
		name in (packageJson?.devDependencies ?? {})
	);
}

/** Returns missing tooling dependencies not installed by the framework adapter. */
function getCfPackagesToInstall(
	packageJson: PackageJSON | undefined,
	enableTargetCliInstallation: boolean,
	scaffold: CfProjectScaffold | undefined
): string[] {
	const packages = [];
	if (enableTargetCliInstallation && !hasProjectDependency(packageJson, "cf")) {
		packages.push("cf@latest");
	}
	if (
		scaffold?.createTsconfig === "required" &&
		!hasProjectDependency(packageJson, "typescript")
	) {
		packages.push("typescript");
	}
	if (scaffold?.installVite) {
		packages.push(`vite@${CF_VITE_VERSION_RANGE}`);
	}
	return packages;
}

/**
 * Applies the common Worker defaults to framework-provided configuration.
 *
 * @param defaultWorkerConfig The common Worker configuration defaults
 * @param workerConfig The framework-provided Worker configuration
 * @returns The merged Worker configuration, or `null` when an external tool owns it
 */
function mergeWorkerConfig(
	defaultWorkerConfig: WorkerConfig,
	workerConfig: Partial<WorkerConfig> | null
): WorkerConfig | null {
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
	workerConfig: WorkerConfig | null,
	configurationResults: ConfigurationResults
): RawConfig | null {
	if (workerConfig === null) {
		return null;
	}

	const parsedConfig = CloudflareConfigSchema.parse({ worker: workerConfig });
	const convertedWranglerConfig = convertToWranglerConfig(parsedConfig);
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
 * Writes the Worker configuration used by `cf`, unless the project already has one, such as
 * one migrated from a Wrangler config.
 *
 * @param projectPath The project directory
 * @param workerConfig The Worker configuration to write
 */
async function saveCloudflareConfig(
	projectPath: string,
	workerConfig: WorkerConfig
): Promise<void> {
	const configPath = resolve(projectPath, "cloudflare.config.ts");
	if (existsSync(configPath)) {
		return;
	}

	await writeFile(configPath, renderCloudflareConfig(workerConfig));
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
function renderCloudflareConfig(workerConfig: WorkerConfig): string {
	// Static directories may have no package.json or local cf installation.
	return `import type { CloudflareConfig } from "cf/config";\n\nexport default {\n  worker: ${JSON.stringify(workerConfig, null, 2).replaceAll("\n", "\n  ")}\n} satisfies CloudflareConfig;\n`;
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
	workerConfig: WorkerConfig | null,
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
					buildTool: configurationResults.buildTool,
				}),
		outputDir: autoConfigDetails.outputDir,
		frameworkId: autoConfigDetails.framework.id,
		buildCommand: projectCommands.build,
		deployCommand: projectCommands.deploy,
		versionCommand: projectCommands.version,
	};

	const scaffold = getCfProjectScaffold(
		autoConfigDetails,
		configurationResults,
		target,
		getWorkspaceVite(autoConfigDetails, target)
	);
	const workspaceVite = scaffold?.workspaceVite;
	if (scaffold?.createPackageJson) {
		logger.log("📄 Create package.json");
		logger.log("");
	}
	const { packageJson, projectPath } = autoConfigDetails;
	const hasPackageJson =
		packageJson !== undefined || scaffold?.createPackageJson;
	const appPackages =
		hasPackageJson && target === "cf"
			? getCfPackagesToInstall(
					packageJson,
					enableTargetCliInstallation,
					scaffold
				)
			: [];
	const packagesToInstall = new Set(appPackages);
	const viteInstallNeeded =
		hasPackageJson &&
		needsViteInstall(autoConfigDetails, target, workspaceVite);
	if (viteInstallNeeded && !workspaceVite && appPackages.length === 0) {
		logger.log("📦 Install project dependencies");
		logger.log("");
	}
	if (hasPackageJson) {
		if (target === "wrangler" && enableTargetCliInstallation) {
			packagesToInstall.add("wrangler");
		}
		if (configurationResults.buildTool === "vite") {
			packagesToInstall.add(
				target === "cf"
					? `@cloudflare/vite-plugin@${CF_VITE_PLUGIN_VERSION_RANGE}`
					: "@cloudflare/vite-plugin"
			);
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
			logger.log(` - ${packageName.replace(/@latest$/, "")} (devDependency)`);
		}
		logger.log("");
	}
	if (viteInstallNeeded && workspaceVite) {
		logger.log(
			appPackages.length > 0
				? "📦 Install workspace dependencies if Vite tooling is still missing"
				: "📦 Install workspace dependencies"
		);
		logger.log("");
	}

	if (hasPackageJson) {
		const existingScripts = packageJson?.scripts ?? {};
		const scriptOverrides =
			target === "wrangler" ? packageJsonScriptsOverrides : undefined;
		const buildCommandPrefix =
			target === "wrangler" && autoConfigDetails.buildCommand
				? `${autoConfigDetails.buildCommand} && `
				: "";
		if (target === "wrangler" || !("deploy" in existingScripts)) {
			summary.scripts.deploy =
				scriptOverrides?.deploy ?? `${buildCommandPrefix}${target} deploy`;
		}
		if (target === "wrangler") {
			summary.scripts.preview =
				scriptOverrides?.preview ?? `${buildCommandPrefix}${target} dev`;
		} else if (scaffold) {
			for (const command of ["dev", "build"]) {
				if (!(command in existingScripts)) {
					summary.scripts[command] = `cf ${command}`;
				}
			}
		}

		const containsServerSideCode =
			// If there is an entrypoint then we know that there is server side code
			!!workerConfig?.entrypoint;

		if (
			// If there is no server side code, then there is no need to add the cf-typegen script
			containsServerSideCode &&
			(scaffold?.createTsconfig || usesTypescript(projectPath)) &&
			!("cf-typegen" in existingScripts)
		) {
			summary.scripts["cf-typegen"] =
				scriptOverrides?.typegen ??
				(target === "cf" ? "cf workers types" : "wrangler types");
		}

		if (Object.keys(summary.scripts).length > 0) {
			logger.log("📝 Update package.json scripts:");
			for (const [name, script] of Object.entries(summary.scripts)) {
				logger.log(` - "${name}": "${script}"`);
			}
			logger.log("");
		}
	}

	// Projects with Worker code (an entrypoint) get the `cf-typegen` script. Its output in
	// `.cloudflare/types` needs its own `include` entry, since patterns like `**/*` skip dot-directories
	const tsconfigUpdate =
		target === "cf" && workerConfig?.entrypoint
			? getCloudflareTypesTsconfigUpdate(autoConfigDetails.projectPath)
			: undefined;
	if (scaffold?.createTsconfig === "required") {
		logger.log("📄 Create tsconfig.json");
		logger.log("");
	} else if (scaffold?.createTsconfig === "fallback") {
		logger.log(
			"📄 After framework setup, create tsconfig.json and install TypeScript if either is still missing."
		);
		logger.log("");
	} else if (tsconfigUpdate?.type === "update") {
		logger.log("📝 Update tsconfig.json:");
		logger.log(
			` - Add ${JSON.stringify(CLOUDFLARE_TYPES_INCLUDE)} to "include"`
		);
		logger.log("");
	} else if (tsconfigUpdate?.type === "manual") {
		logger.warn(tsconfigUpdate.message);
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
