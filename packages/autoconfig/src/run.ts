import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
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
	getInstalledPackageVersion,
	isNodejsCompatDefaultOn,
	parseJSONC,
} from "@cloudflare/workers-utils";
import {
	mergeCloudflareConfig,
	readWorkerEntrypoint,
} from "./cloudflare-config";
import {
	assertNonConfigured,
	assertProjectCommandsAvailable,
	confirmAutoConfigDetails,
	displayAutoConfigDetails,
	getProjectCommand,
	getDetailsForAutoConfig,
} from "./details";
import {
	isFrameworkSupported,
	isKnownFramework,
	requiresFrameworkSetup,
	type PackageJsonScriptsOverrides,
	validateFrameworkTargetSupport,
} from "./frameworks";
import { getFrameworkPackageInfo } from "./frameworks/all-frameworks";
import { Static } from "./frameworks/static";
import { CF_VITE_PLUGIN_VERSION_RANGE } from "./frameworks/utils/vite-plugin-version";
import {
	CLOUDFLARE_TYPES_INCLUDE,
	getCloudflareTypesTsconfigUpdate,
	saveCloudflareTypesTsconfigUpdate,
} from "./tsconfig";
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
import type { WorkerConfig } from "@cloudflare/config";
import type { PackageJSON } from "@cloudflare/workers-utils";
import type { RawConfig } from "@cloudflare/workers-utils/config";

/**
 * Runs the full autoconfig flow: displays detected settings, confirms with the user,
 * validates the framework version, runs framework configuration, writes configuration,
 * updates package.json scripts, and optionally runs the build command. For a Wrangler project it
 * migrates the Wrangler config to `cloudflare.config.ts` instead, without setting up a framework.
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

	if ("wranglerConfigPath" in autoConfigDetails) {
		const { framework, outputDir, packageJson, projectPath } =
			autoConfigDetails;
		// Framework setup works on the project root, so it only follows a migration of the root's Wrangler config
		const cfFramework =
			framework !== undefined &&
			requiresFrameworkSetup(framework.id) &&
			dirname(autoConfigDetails.wranglerConfigPath) === resolve(projectPath);
		// Framework setup sets up Vite when the framework isn't set up for cf yet
		const frameworkSetsUpVite =
			cfFramework &&
			autoConfigOptions.bundler !== "wrangler" &&
			outputDir !== undefined &&
			!framework.isConfigured(projectPath, { target });
		// It runs after migrating once the framework is installed, which a fresh checkout isn't yet,
		// and otherwise on the next run
		const frameworkPackageInfo = frameworkSetsUpVite
			? getFrameworkPackageInfo(framework.id, target)
			: undefined;
		const setUpFramework =
			frameworkSetsUpVite &&
			(frameworkPackageInfo === undefined ||
				getInstalledPackageVersion(frameworkPackageInfo.name, projectPath) !==
					undefined);
		const bundler =
			autoConfigOptions.bundler ??
			(cfFramework ||
			packageJson?.dependencies?.["@cloudflare/vite-plugin"] !== undefined ||
			packageJson?.devDependencies?.["@cloudflare/vite-plugin"] !== undefined
				? "vite"
				: "wrangler");
		if (setUpFramework) {
			// Check that the framework can be set up before the migration changes anything
			if (frameworkPackageInfo) {
				framework.validateFrameworkVersion(
					projectPath,
					frameworkPackageInfo,
					context
				);
			}
			await framework.configure({
				target,
				outputDir,
				projectPath,
				workerName: autoConfigDetails.workerName,
				isWorkspaceRoot: autoConfigDetails.isWorkspaceRoot ?? false,
				dryRun: true,
				packageManager: autoConfigDetails.packageManager,
				context,
			});
		}
		if (
			!(
				skipConfirmations ||
				(await context.dialogs.confirm(
					`Migrate ${relative(process.cwd(), autoConfigDetails.wranglerConfigPath)} to cloudflare.config.ts${setUpFramework ? ` and set up ${framework.name}` : ""}?`
				))
			)
		) {
			throw new FatalError("Setup cancelled", {
				telemetryMessage: "autoconfig run setup cancelled",
			});
		}

		// Loaded on use, so that importing autoconfig doesn't load the migration and its Git helper
		const { migrateWranglerToCf } = await import("./wrangler-to-cf");
		const wranglerMigration = await migrateWranglerToCf(
			autoConfigDetails.wranglerConfigPath,
			{
				bundler,
				dryRun,
				force: !autoConfigOptions.requireCleanGitWorktree,
				installDependencies: enableTargetCliInstallation,
				// Framework setup installs and configures the Vite plugin, and builds the static assets
				frameworkAssetsDirectory: frameworkSetsUpVite ? outputDir : undefined,
			}
		);
		if (!setUpFramework || dryRun || wranglerMigration.status !== "complete") {
			return { scripts: {}, wranglerMigration };
		}

		// Now that the project has a cloudflare.config.ts, detection finds the framework setup it needs
		const migratedDetails = await getDetailsForAutoConfig({
			projectPath,
			target,
			context,
		});
		if (migratedDetails.configured) {
			return { scripts: {}, wranglerMigration };
		}
		return {
			...(await runAutoConfig(migratedDetails, {
				...autoConfigOptions,
				skipConfirmations: true,
			})),
			wranglerMigration,
		};
	}

	// Frameworks can keep parts of an existing Worker config, such as a migrated one's own Worker entrypoint
	const cloudflareConfigPath = resolve(
		autoConfigDetails.projectPath,
		"cloudflare.config.ts"
	);
	const existingWorkerConfig =
		target === "cf" && existsSync(cloudflareConfigPath)
			? {
					entrypoint: readWorkerEntrypoint(
						readFileSync(cloudflareConfigPath, "utf8")
					),
				}
			: undefined;

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
			existingWorkerConfig,
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
			autoConfigDetails.packageJson,
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

	if (autoConfigDetails.packageJson && enableTargetCliInstallation) {
		if (target === "cf") {
			const hasCfDependency =
				autoConfigDetails.packageJson.dependencies?.cf !== undefined ||
				autoConfigDetails.packageJson.devDependencies?.cf !== undefined;
			if (!hasCfDependency) {
				await installPackages(packageManager.type, ["cf@latest"], {
					dev: true,
					isWorkspaceRoot,
				});
			}
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
		existingWorkerConfig,
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
			await saveCloudflareConfig(
				autoConfigDetails.projectPath,
				workerConfig,
				configurationResults.workerConfig ?? {}
			);
		}
		// Only projects with Worker code (an entrypoint) use the types that `cf-typegen` generates
		if (workerConfig?.entrypoint) {
			await saveCloudflareTypesTsconfigUpdate(
				autoConfigDetails.projectPath,
				context
			);
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
				additionalEntries: PROJECT_ROOT_ASSETS_IGNORE_ENTRIES,
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
			buildCommand = getProjectCommand(
				buildCommand,
				packageManager,
				configuredDetails.packageJson,
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
 * Writes the Worker configuration used by `cf`, merging it into an existing
 * `cloudflare.config.ts` instead of replacing it.
 *
 * @param projectPath The project directory
 * @param workerConfig The Worker configuration to write
 * @param frameworkWorkerConfig The part of `workerConfig` set by the framework
 */
async function saveCloudflareConfig(
	projectPath: string,
	workerConfig: WorkerConfig,
	frameworkWorkerConfig: Partial<WorkerConfig>
): Promise<void> {
	await writeFile(
		resolve(projectPath, "cloudflare.config.ts"),
		getCloudflareConfigContent(projectPath, workerConfig, frameworkWorkerConfig)
	);
}

/**
 * Renders the `cloudflare.config.ts` that autoconfig writes.
 *
 * @param projectPath The project directory
 * @param workerConfig The Worker configuration to write
 * @param frameworkWorkerConfig The part of `workerConfig` set by the framework
 * @returns A new configuration module, or the existing one with the configuration merged into it
 */
function getCloudflareConfigContent(
	projectPath: string,
	workerConfig: WorkerConfig,
	frameworkWorkerConfig: Partial<WorkerConfig>
): string {
	const configPath = resolve(projectPath, "cloudflare.config.ts");
	return existsSync(configPath)
		? mergeCloudflareConfig(
				readFileSync(configPath, "utf8"),
				workerConfig,
				frameworkWorkerConfig
			)
		: renderCloudflareConfig(workerConfig);
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
			logger.log(` - ${packageName} (devDependency)`);
		}
		logger.log("");
	}

	if (autoConfigDetails.packageJson) {
		const scriptOverrides =
			target === "wrangler" ? packageJsonScriptsOverrides : undefined;
		const buildCommandPrefix =
			target === "wrangler" && autoConfigDetails.buildCommand
				? `${autoConfigDetails.buildCommand} && `
				: "";
		summary.scripts = {
			deploy:
				scriptOverrides?.deploy ?? `${buildCommandPrefix}${target} deploy`,
		};
		if (target === "wrangler") {
			summary.scripts.preview =
				scriptOverrides?.preview ?? `${buildCommandPrefix}${target} dev`;
		}

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
				scriptOverrides?.typegen ??
				(target === "cf" ? "cf workers types" : "wrangler types");
		}

		logger.log("📝 Update package.json scripts:");
		for (const [name, script] of Object.entries(summary.scripts)) {
			logger.log(` - "${name}": "${script}"`);
		}
		logger.log("");
	}

	// Projects with Worker code (an entrypoint) get the `cf-typegen` script. Its output in
	// `.cloudflare/types` needs its own `include` entry, since patterns like `**/*` skip dot-directories
	const tsconfigUpdate =
		target === "cf" && workerConfig?.entrypoint
			? getCloudflareTypesTsconfigUpdate(autoConfigDetails.projectPath)
			: undefined;
	if (tsconfigUpdate?.type === "update") {
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
		const configExists = existsSync(
			resolve(autoConfigDetails.projectPath, "cloudflare.config.ts")
		);
		logger.log(
			configExists
				? "📄 Update cloudflare.config.ts:"
				: "📄 Create cloudflare.config.ts:"
		);
		logger.log(
			indentFileContent(
				getCloudflareConfigContent(
					autoConfigDetails.projectPath,
					workerConfig,
					configurationResults.workerConfig ?? {}
				)
			)
		);
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
