import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { endSection, startSection } from "@cloudflare/cli";
import { FatalError } from "@cloudflare/workers-utils";
import { runCommand } from "../deployment-bundle/run-custom-build";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { sendMetricsEvent } from "../metrics";
import { getDevCompatibilityDate } from "../utils/compatibility-date";
import { addWranglerToAssetsIgnore } from "./add-wrangler-assetsignore";
import { addWranglerToGitIgnore } from "./c3-vendor/add-wrangler-gitignore";
import { installWrangler } from "./c3-vendor/packages";
import { confirmAutoConfigDetails, displayAutoConfigDetails } from "./details";
import type { AutoConfigDetails } from "./types";
import type { RawConfig } from "@cloudflare/workers-utils";

type AutoconfigMetrics = Pick<
	AutoConfigDetails,
	"buildCommand" | "outputDir"
> & {
	framework: string | undefined;
};

export async function runAutoConfig(
	autoConfigDetails: AutoConfigDetails
): Promise<void> {
	const detected: AutoconfigMetrics = {
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

	const updatedAutoConfigDetails =
		await confirmAutoConfigDetails(autoConfigDetails);

	if (autoConfigDetails !== updatedAutoConfigDetails) {
		displayAutoConfigDetails(updatedAutoConfigDetails, {
			heading: "Updated Project Settings:",
		});
	}

	const deploy = await confirm(
		"Do you want to proceed with the deployment using these settings?"
	);
	if (!deploy) {
		throw new FatalError("Deployment aborted");
	}
	if (!autoConfigDetails.outputDir) {
		throw new FatalError("Cannot deploy project without an output directory");
	}

	logger.debug(
		`Running autoconfig with:\n${JSON.stringify(autoConfigDetails, null, 2)}...`
	);

	startSection("Configuring your application for Cloudflare");

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
				name: autoConfigDetails.workerName,
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

	const used: AutoconfigMetrics = {
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
