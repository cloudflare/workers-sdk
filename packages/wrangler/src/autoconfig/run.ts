import assert from "node:assert";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
	FatalError,
	getLocalWorkerdCompatibilityDate,
	parseJSONC,
} from "@cloudflare/workers-utils";
import { runCommand } from "../deployment-bundle/run-custom-build";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { sendMetricsEvent } from "../metrics";
import { sanitizeError } from "../metrics/sanitization";
import { addWranglerToAssetsIgnore } from "./add-wrangler-assetsignore";
import { addWranglerToGitIgnore } from "./c3-vendor/add-wrangler-gitignore";
import { installWrangler } from "./c3-vendor/packages";
import {
	assertNonConfigured,
	confirmAutoConfigDetails,
	displayAutoConfigDetails,
} from "./details";
import { Static } from "./frameworks/static";
import { getAutoConfigId } from "./telemetry-utils";
import { usesTypescript } from "./uses-typescript";
import type { PackageJsonScriptsOverrides } from "./frameworks";
import type {
	AutoConfigDetails,
	AutoConfigDetailsForNonConfiguredProject,
	AutoConfigOptions,
	AutoConfigSummary,
} from "./types";
import type { PackageJSON, RawConfig } from "@cloudflare/workers-utils";

export async function runAutoConfig(
	autoConfigDetails: AutoConfigDetails,
	autoConfigOptions: AutoConfigOptions = {}
): Promise<AutoConfigSummary> {
	const dryRun = autoConfigOptions.dryRun === true;
	const runBuild = !dryRun && (autoConfigOptions.runBuild ?? true);
	const skipConfirmations =
		dryRun || autoConfigOptions.skipConfirmations === true;
	const enableWranglerInstallation =
		autoConfigOptions.enableWranglerInstallation ?? true;

	const autoConfigId = getAutoConfigId();

	sendMetricsEvent(
		"autoconfig_configuration_started",
		{
			autoConfigId,
			framework: autoConfigDetails.framework?.id,
			dryRun,
		},
		{}
	);

	assertNonConfigured(autoConfigDetails);

	let autoConfigSummary: AutoConfigSummary;

	try {
		displayAutoConfigDetails(autoConfigDetails);

		const updatedAutoConfigDetails = skipConfirmations
			? autoConfigDetails
			: await confirmAutoConfigDetails(autoConfigDetails);

		if (autoConfigDetails !== updatedAutoConfigDetails) {
			displayAutoConfigDetails(updatedAutoConfigDetails, {
				heading: "Updated Project Settings:",
			});
		}

		autoConfigDetails = updatedAutoConfigDetails;
		assertNonConfigured(autoConfigDetails);

		if (!autoConfigDetails.framework.autoConfigSupported) {
			throw new FatalError(
				autoConfigDetails.framework.id === "cloudflare-pages"
					? `The target project seems to be using Cloudflare Pages. Automatically migrating from a Pages project to a Workers one is not yet supported.`
					: `The detected framework ("${autoConfigDetails.framework.name}") cannot be automatically configured.`
			);
		}

		assert(
			autoConfigDetails.outputDir,
			"The Output Directory is unexpectedly missing"
		);

		const { date: compatibilityDate } = getLocalWorkerdCompatibilityDate({
			projectPath: autoConfigDetails.projectPath,
		});

		const wranglerConfig: RawConfig = {
			$schema: "node_modules/wrangler/config-schema.json",
			name: autoConfigDetails.workerName,
			compatibility_date: compatibilityDate,
			observability: {
				enabled: true,
			},
		} satisfies RawConfig;

		const { packageManager } = autoConfigDetails;

		const dryRunConfigurationResults =
			await autoConfigDetails.framework.configure({
				outputDir: autoConfigDetails.outputDir,
				projectPath: autoConfigDetails.projectPath,
				workerName: autoConfigDetails.workerName,
				dryRun: true,
				packageManager,
			});

		const { npx } = packageManager;

		autoConfigSummary = await buildOperationsSummary(
			{ ...autoConfigDetails, outputDir: autoConfigDetails.outputDir },
			ensureNodejsCompatIsInConfig({
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
			dryRunConfigurationResults.packageJsonScriptsOverrides
		);

		if (!(skipConfirmations || (await confirm("Proceed with setup?")))) {
			throw new FatalError("Setup cancelled");
		}

		if (dryRun) {
			logger.log(
				`✋  ${"Autoconfig process run in dry-run mode, existing now."}`
			);
			logger.log("");

			sendMetricsEvent(
				"autoconfig_configuration_completed",
				{
					autoConfigId,
					framework: autoConfigDetails.framework?.id,
					success: true,
					dryRun,
				},
				{}
			);

			return autoConfigSummary;
		}

		logger.debug(
			`Running autoconfig with:\n${JSON.stringify(autoConfigDetails, null, 2)}...`
		);

		if (autoConfigSummary.wranglerInstall && enableWranglerInstallation) {
			await installWrangler(packageManager);
		}

		const configurationResults = await autoConfigDetails.framework.configure({
			outputDir: autoConfigDetails.outputDir,
			projectPath: autoConfigDetails.projectPath,
			workerName: autoConfigDetails.workerName,
			dryRun: false,
			packageManager,
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

		await saveWranglerJsonc(
			autoConfigDetails.projectPath,
			ensureNodejsCompatIsInConfig({
				...wranglerConfig,
				...configurationResults.wranglerConfig,
			})
		);

		addWranglerToGitIgnore(autoConfigDetails.projectPath);

		// If we're uploading the project path as the output directory, make sure we don't accidentally upload any sensitive Wrangler files
		if (autoConfigDetails.outputDir === autoConfigDetails.projectPath) {
			addWranglerToAssetsIgnore(autoConfigDetails.projectPath);
		}

		const buildCommand =
			configurationResults.buildCommandOverride ??
			autoConfigDetails.buildCommand;

		if (buildCommand && runBuild) {
			await runCommand(buildCommand, autoConfigDetails.projectPath, "[build]");
		}
	} catch (error) {
		sendMetricsEvent(
			"autoconfig_configuration_completed",
			{
				autoConfigId,

				framework: autoConfigDetails.framework?.id,
				dryRun,
				success: false,
				...sanitizeError(error),
			},
			{}
		);

		throw error;
	}

	sendMetricsEvent(
		"autoconfig_configuration_completed",
		{
			autoConfigId,
			framework: autoConfigDetails.framework?.id,
			success: true,
			dryRun,
		},
		{}
	);

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

export async function buildOperationsSummary(
	autoConfigDetails: AutoConfigDetailsForNonConfiguredProject & {
		outputDir: NonNullable<AutoConfigDetails["outputDir"]>;
	},
	wranglerConfigToWrite: RawConfig,
	projectCommands: {
		build?: string;
		deploy: string;
		version?: string;
	},
	packageJsonScriptsOverrides?: PackageJsonScriptsOverrides
): Promise<AutoConfigSummary> {
	logger.log("");

	const summary: AutoConfigSummary = {
		wranglerInstall: false,
		scripts: {},
		wranglerConfig: wranglerConfigToWrite,
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
			!!wranglerConfigToWrite.main;

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
