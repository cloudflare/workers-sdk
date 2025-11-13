import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { FatalError } from "@cloudflare/workers-utils";
import { runCommand } from "../deployment-bundle/run-custom-build";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { sendMetricsEvent } from "../metrics";
import { getDevCompatibilityDate } from "../utils/compatibility-date";
import { capitalize } from "../utils/strings";
import { addWranglerToAssetsIgnore } from "./add-wrangler-assetsignore";
import { addWranglerToGitIgnore } from "./c3-vendor/add-wrangler-gitignore";
import { installWrangler } from "./c3-vendor/packages";
import { confirmAutoConfigDetails, displayAutoConfigDetails } from "./details";
import { Static } from "./frameworks/static";
import type { AutoConfigDetails } from "./types";
import type { RawConfig } from "@cloudflare/workers-utils";

type AutoConfigMetrics = Pick<
	AutoConfigDetails,
	"buildCommand" | "outputDir"
> & {
	framework: string | undefined;
};

export async function runAutoConfig(
	autoConfigDetails: AutoConfigDetails,
	{ build = true, skipConfirmation = false } = {}
): Promise<void> {
	const detected: AutoConfigMetrics = {
		buildCommand: autoConfigDetails.buildCommand,
		outputDir: autoConfigDetails.outputDir,
		framework: autoConfigDetails.framework?.name,
	};
	sendMetricsEvent(
		"autoconfig detected",
		{
			detected,
		},
		{}
	);
	displayAutoConfigDetails(autoConfigDetails);

	const updatedAutoConfigDetails = skipConfirmation
		? autoConfigDetails
		: await confirmAutoConfigDetails(autoConfigDetails);

	if (autoConfigDetails !== updatedAutoConfigDetails) {
		displayAutoConfigDetails(updatedAutoConfigDetails, {
			heading: "Updated Project Settings:",
		});
	}

	autoConfigDetails = updatedAutoConfigDetails;

	if (!autoConfigDetails.outputDir) {
		throw new FatalError("Cannot deploy project without an output directory");
	}

	const additionalConfigDetails =
		(await autoConfigDetails.framework?.configure(
			autoConfigDetails.outputDir
		)) ?? {};

	const wranglerConfig: RawConfig = {
		$schema: "node_modules/wrangler/config-schema.json",
		name: autoConfigDetails.workerName,
		compatibility_date: getDevCompatibilityDate(undefined),
		observability: {
			enabled: true,
		},
		...additionalConfigDetails,
	} satisfies RawConfig;

	const modifications = await buildOperationsSummary(
		autoConfigDetails,
		wranglerConfig
	);

	if (!(skipConfirmation || (await confirm("Proceed with setup?")))) {
		throw new FatalError("Deployment aborted");
	}

	logger.debug(
		`Running autoconfig with:\n${JSON.stringify(autoConfigDetails, null, 2)}...`
	);

	if (modifications.wranglerInstall) {
		await installWrangler();
	}

	if (autoConfigDetails.packageJson) {
		await writeFile(
			resolve(autoConfigDetails.projectPath, "package.json"),
			JSON.stringify(
				{
					...autoConfigDetails.packageJson,
					scripts: {
						...autoConfigDetails.packageJson.scripts,
						...modifications.scripts,
					},
				},
				null,
				2
			)
		);
	}

	await writeFile(
		resolve(autoConfigDetails.projectPath, "wrangler.jsonc"),
		JSON.stringify(wranglerConfig, null, 2)
	);

	addWranglerToGitIgnore(autoConfigDetails.projectPath);

	// If we're uploading the project path as the output directory, make sure we don't accidentally upload any sensitive Wrangler files
	if (autoConfigDetails.outputDir === autoConfigDetails.projectPath) {
		addWranglerToAssetsIgnore(autoConfigDetails.projectPath);
	}

	if (autoConfigDetails.buildCommand && build) {
		await runCommand(
			autoConfigDetails.buildCommand,
			autoConfigDetails.projectPath,
			"[build]"
		);
	}

	const used: AutoConfigMetrics = {
		buildCommand: autoConfigDetails.buildCommand,
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

	return;
}

function usesTypescript(projectPath: string) {
	return existsSync(join(projectPath, `tsconfig.json`));
}

type Modifications = {
	wranglerInstall: boolean;
	scripts: Record<string, string>;
};

export async function buildOperationsSummary(
	autoConfigDetails: AutoConfigDetails,
	wranglerConfigToWrite: RawConfig
): Promise<Modifications> {
	logger.log("");

	const modifications: Modifications = {
		wranglerInstall: false,
		scripts: {},
	};
	if (autoConfigDetails.packageJson) {
		// If there is a package.json file we will want to install wrangler
		modifications.wranglerInstall = true;

		logger.log("📦 Install packages:");
		logger.log(` - wrangler (devDependency)`);
		logger.log("");

		modifications.scripts = {
			deploy: autoConfigDetails.buildCommand
				? `${autoConfigDetails.buildCommand} && wrangler deploy`
				: `wrangler deploy`,
			preview: autoConfigDetails.buildCommand
				? `${autoConfigDetails.buildCommand} && wrangler dev`
				: `wrangler dev`,
		};

		// TODO: Implement the logic to discern whether the project contains server code or not
		//       (basically if it is fully static)
		const containsServerSideCode = false;

		if (
			// If there is no server side code, then there is no need to add the cf-typegen script
			containsServerSideCode &&
			usesTypescript(autoConfigDetails.projectPath) &&
			!("cf-typegen" in (autoConfigDetails.packageJson.scripts ?? {}))
		) {
			modifications.scripts["cf-typegen"] = "wrangler types";
		}

		logger.log("📝 Update package.json scripts:");
		for (const [name, script] of Object.entries(modifications.scripts)) {
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
		!autoConfigDetails.framework.configured
	) {
		logger.log(
			`🛠️  ${
				autoConfigDetails.framework.configurationDescription ??
				`Configuring project for ${capitalize(autoConfigDetails.framework.name)}`
			}`
		);
		logger.log("");
	}

	return modifications;
}
