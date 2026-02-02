import { configFileName, UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../../../cfetch";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { getLegacyScriptName } from "../../../utils/getLegacyScriptName";
import { fetchDeploymentVersions, fetchLatestDeployment } from "../api";
import type { VersionDetails } from ".";
import type { ApiVersion, VersionCache } from "../types";

export const versionsSecretsListCommand = createCommand({
	metadata: {
		description: "List the secrets currently deployed",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printConfigWarnings: false,
	},
	args: {
		name: {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		},
		"latest-version": {
			describe: "Only show the latest version",
			type: "boolean",
			default: false,
		},
	},
	handler: async function versionsSecretListHandler(args, { config }) {
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
					config,
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
			const latestDeployment = await fetchLatestDeployment(
				config,
				accountId,
				scriptName
			);
			const deploymentVersion = latestDeployment?.versions.find(
				(ver) => ver.version_id === latestVersion.id
			);

			rollout.set(latestVersion.id, deploymentVersion?.percentage ?? 0);
		} else {
			const latestDeployment = await fetchLatestDeployment(
				config,
				accountId,
				scriptName
			);
			[versions, rollout] = await fetchDeploymentVersions(
				config,
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
	},
});
