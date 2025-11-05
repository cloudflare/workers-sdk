import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { endSection, startSection } from "@cloudflare/cli";
import { brandColor } from "@cloudflare/cli/colors";
import { FatalError } from "@cloudflare/workers-utils";
import { runCommand } from "../deployment-bundle/run-custom-build";
import { confirm } from "../dialogs";
import { getCIOverrideName } from "../environment-variables/misc-variables";
import { logger } from "../logger";
import { getDevCompatibilityDate } from "../utils/compatibility-date";
import { addWranglerToAssetsIgnore } from "./add-wrangler-assetsignore";
import { addWranglerToGitIgnore } from "./c3-vendor/add-wrangler-gitignore";
import { installWrangler } from "./c3-vendor/packages";
import type { AutoConfigDetails } from "./types";
import type { RawConfig } from "@cloudflare/workers-utils";

export async function runAutoConfig(
	autoConfigDetails: AutoConfigDetails
): Promise<void> {
	logger.debug(
		`Running autoconfig with:\n${JSON.stringify(autoConfigDetails, null, 2)}...`
	);
	logger.log("Project settings detected:");
	if (autoConfigDetails.framework) {
		logger.log(brandColor("Framework:"), autoConfigDetails.framework.name);
	}
	if (autoConfigDetails.buildCommand) {
		logger.log(brandColor("Build Command:"), autoConfigDetails.buildCommand);
	}
	if (autoConfigDetails.outputDir) {
		logger.log(brandColor("Output Directory:"), autoConfigDetails.outputDir);
	}

	const deploy = await confirm("Do you want to deploy using these settings?");
	if (!deploy) {
		throw new FatalError("Deployment aborted");
	}
	if (!autoConfigDetails.outputDir) {
		throw new FatalError("Cannot deploy project without an output directory");
	}

	startSection("Configuring your application for Cloudflare", "Step 2 of 3");

	await installWrangler();

	const additionalConfigDetails =
		(await autoConfigDetails.framework?.configure(
			autoConfigDetails.outputDir
		)) ?? {};
	await writeFile(
		resolve("wrangler.jsonc"),
		JSON.stringify(
			{
				$schema: "node_modules/wrangler/config-schema.json",
				name:
					getCIOverrideName() ??
					autoConfigDetails.packageJson?.name ??
					dirname(autoConfigDetails.projectPath),
				compatibility_date: getDevCompatibilityDate(undefined),
				observability: {
					enabled: true,
				},
				...additionalConfigDetails,
			} satisfies RawConfig,
			null,
			2
		)
	);

	addWranglerToGitIgnore(autoConfigDetails.projectPath);

	// If we're uploading the project path as the output directory, make sure we don't accidentally upload any sensitive Wrangler files
	if (autoConfigDetails.outputDir === autoConfigDetails.projectPath) {
		addWranglerToAssetsIgnore(autoConfigDetails.projectPath);
	}

	endSection(`Application configured`);

	if (autoConfigDetails.buildCommand) {
		await runCommand(
			autoConfigDetails.buildCommand,
			autoConfigDetails.projectPath,
			"[build]"
		);
	}

	return;
}
