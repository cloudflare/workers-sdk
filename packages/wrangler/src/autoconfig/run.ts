import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
	FatalError,
	getLocalWorkerdCompatibilityDate,
} from "@cloudflare/workers-utils";
import { runCommand } from "../deployment-bundle/run-custom-build";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { sendMetricsEvent } from "../metrics";
import { getPackageManager } from "../package-manager";
import { addWranglerToAssetsIgnore } from "./add-wrangler-assetsignore";
import { addWranglerToGitIgnore } from "./c3-vendor/add-wrangler-gitignore";
import { installWrangler } from "./c3-vendor/packages";
import { confirmAutoConfigDetails, displayAutoConfigDetails } from "./details";
import { Static } from "./frameworks/static";
import { usesTypescript } from "./uses-typescript";
import type { PackageJsonScriptsOverrides } from "./frameworks";
import type {
	AutoConfigDetails,
	AutoConfigOptions,
	AutoConfigSummary,
} from "./types";
import type { PackageJSON, RawConfig } from "@cloudflare/workers-utils";

type AutoConfigMetrics = Pick<
	AutoConfigDetails,
	"buildCommand" | "outputDir"
> & {
	framework: string | undefined;
};

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

	const detected: AutoConfigMetrics = {
		buildCommand: autoConfigDetails.buildCommand,
		outputDir: autoConfigDetails.outputDir,
		framework: autoConfigDetails.framework?.name,
	};
	sendMetricsEvent(
		"autoconfig detected",
		{
			detected,
			options: autoConfigOptions,
		},
		{}
	);
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

	if (!autoConfigDetails.outputDir) {
		throw new FatalError(
			"Cannot configure project without an output directory"
		);
	}

	if (
		autoConfigDetails.framework &&
		!autoConfigDetails.framework?.autoConfigSupported
	) {
		throw new FatalError(
			`The detected framework ("${autoConfigDetails.framework.name}") cannot be automatically configured.`
		);
	}

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

	const dryRunConfigurationResults =
		await autoConfigDetails.framework?.configure({
			outputDir: autoConfigDetails.outputDir,
			projectPath: autoConfigDetails.projectPath,
			workerName: autoConfigDetails.workerName,
			dryRun: true,
		});

	const { npx } = await getPackageManager();

	const autoConfigSummary = await buildOperationsSummary(
		{ ...autoConfigDetails, outputDir: autoConfigDetails.outputDir },
		{
			...wranglerConfig,
			...dryRunConfigurationResults?.wranglerConfig,
		},
		{
			build: dryRunConfigurationResults?.buildCommand,
			deploy:
				dryRunConfigurationResults?.deployCommand ?? `${npx} wrangler deploy`,
		},
		dryRunConfigurationResults?.packageJsonScriptsOverrides
	);

	if (!(skipConfirmations || (await confirm("Proceed with setup?")))) {
		throw new FatalError("Setup cancelled");
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
		await installWrangler();
	}

	const configurationResults = await autoConfigDetails.framework?.configure({
		outputDir: autoConfigDetails.outputDir,
		projectPath: autoConfigDetails.projectPath,
		workerName: autoConfigDetails.workerName,
		dryRun: false,
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
					name: autoConfigDetails.packageJson.name ?? existingPackageJson.name,
					dependencies: {
						...existingPackageJson.dependencies,
						...autoConfigDetails.packageJson.dependencies,
					},
					devDependencies: {
						...existingPackageJson.devDependencies,
						...autoConfigDetails.packageJson.devDependencies,
					},
					scripts: {
						...existingPackageJson.scripts,
						...autoConfigDetails.packageJson.scripts,
						...autoConfigSummary.scripts,
					},
				} satisfies PackageJSON,
				null,
				2
			)
		);
	}

	await writeFile(
		resolve(autoConfigDetails.projectPath, "wrangler.jsonc"),
		JSON.stringify(
			{ ...wranglerConfig, ...configurationResults?.wranglerConfig },
			null,
			2
		)
	);

	addWranglerToGitIgnore(autoConfigDetails.projectPath);

	// If we're uploading the project path as the output directory, make sure we don't accidentally upload any sensitive Wrangler files
	if (autoConfigDetails.outputDir === autoConfigDetails.projectPath) {
		addWranglerToAssetsIgnore(autoConfigDetails.projectPath);
	}

	const buildCommand =
		configurationResults?.buildCommand ?? autoConfigDetails.buildCommand;

	if (buildCommand && runBuild) {
		await runCommand(buildCommand, autoConfigDetails.projectPath, "[build]");
	}

	const used: AutoConfigMetrics = {
		buildCommand,
		outputDir: autoConfigDetails.outputDir,
		framework: autoConfigDetails.framework?.name,
	};

	sendMetricsEvent(
		"autoconfig accepted",
		{
			detected,
			used,
		},
		{}
	);

	return autoConfigSummary;
}

export async function buildOperationsSummary(
	autoConfigDetails: Omit<AutoConfigDetails, "outputDir"> & {
		outputDir: NonNullable<AutoConfigDetails["outputDir"]>;
	},
	wranglerConfigToWrite: RawConfig,
	projectCommands: {
		build?: string;
		deploy: string;
	},
	packageJsonScriptsOverrides?: PackageJsonScriptsOverrides
): Promise<AutoConfigSummary> {
	logger.log("");

	const summary: AutoConfigSummary = {
		wranglerInstall: false,
		scripts: {},
		wranglerConfig: wranglerConfigToWrite,
		outputDir: autoConfigDetails.outputDir,
		frameworkId: autoConfigDetails.framework?.id,
		buildCommand: projectCommands.build,
		deployCommand: projectCommands.deploy,
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

		const containsServerSideCode = !!wranglerConfigToWrite.main;

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

	logger.log("📄 Create wrangler.jsonc:");
	logger.log(
		"  " + JSON.stringify(wranglerConfigToWrite, null, 2).replace(/\n/g, "\n  ")
	);
	logger.log("");

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
