import { fetchResult } from "../../cfetch";
import { configFileName, readConfig } from "../../config";
import { UserError } from "../../errors";
import { getLegacyScriptName } from "../../index";
import { logger } from "../../logger";
import { printWranglerBanner } from "../../update-check";
import { requireAuth } from "../../user";
import { fetchDeploymentVersions, fetchLatestDeployment } from "../api";
import type { VersionDetails } from ".";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../../yargs-types";
import type { ApiVersion, VersionCache } from "../types";

export function versionsSecretsListOptions(yargs: CommonYargsArgv) {
	return yargs
		.option("name", {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		})
		.option("latest-version", {
			describe: "Only show the latest version",
			type: "boolean",
			default: false,
		});
}

export async function versionsSecretListHandler(
	args: StrictYargsOptionsToInterface<typeof versionsSecretsListOptions>
) {
	await printWranglerBanner();
	const config = readConfig(args.config, args, false, true);

	const scriptName = getLegacyScriptName(args, config);
	if (!scriptName) {
		throw new UserError(
			`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name <worker-name>\``
		);
	}

	const accountId = await requireAuth(config);
	const versionCache: VersionCache = new Map();

	let versions: ApiVersion[] = [];
	let rollout: Map<string, number> = new Map();
	if (args.latestVersion) {
		// Grab the latest version
		const mostRecentVersions = (
			await fetchResult<{ items: ApiVersion[] }>(
				`/accounts/${accountId}/workers/scripts/${scriptName}/versions`
			)
		).items;
		if (mostRecentVersions.length === 0) {
			throw new UserError(
				"There are currently no uploaded versions of this Worker - please upload a version."
			);
		}
		const latestVersion = mostRecentVersions[0];
		versions = [latestVersion];

		// Check if the version is in the latest deployment
		const latestDeployment = await fetchLatestDeployment(accountId, scriptName);
		const deploymentVersion = latestDeployment?.versions.find(
			(ver) => ver.version_id === latestVersion.id
		);

		rollout.set(latestVersion.id, deploymentVersion?.percentage ?? 0);
	} else {
		const latestDeployment = await fetchLatestDeployment(accountId, scriptName);
		[versions, rollout] = await fetchDeploymentVersions(
			accountId,
			scriptName,
			latestDeployment,
			versionCache
		);
	}

	for (const version of versions) {
		logger.log(
			`-- Version ${version.id} (${rollout.get(version.id)}%) secrets --`
		);

		const secrets = (version as VersionDetails).resources.bindings.filter(
			(binding) => binding.type === "secret_text"
		);
		for (const secret of secrets) {
			logger.log(`Secret Name: ${secret.name}`);
		}

		logger.log();
	}
}
