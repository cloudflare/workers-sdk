import { fetchResult } from "../../cfetch";
import { configFileName } from "../../config";
import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { UserError } from "../../errors";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { getLegacyScriptName } from "../../utils/getLegacyScriptName";
import { isLegacyEnv } from "../../utils/isLegacyEnv";
import { copyWorkerVersionWithNewSecrets } from "./index";
import type { VersionDetails, WorkerVersion } from "./index";

export const versionsSecretDeleteCommand = createCommand({
	metadata: {
		description: "Delete a secret variable from a Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		printConfigWarnings: false,
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
	},
	args: {
		key: {
			describe: "The variable name to be accessible in the Worker",
			type: "string",
			requiresArg: true,
		},
		name: {
			describe: "Name of the Worker",
			type: "string",
			requiresArg: true,
		},
		message: {
			describe: "Description of this deployment",
			type: "string",
			requiresArg: true,
		},
		tag: {
			describe: "A tag for this version",
			type: "string",
			requiresArg: true,
		},
	},
	positionalArgs: ["key"],
	handler: async function versionsSecretDeleteHandler(args, { config }) {
		const scriptName = getLegacyScriptName(args, config);
		if (!scriptName) {
			throw new UserError(
				`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name <worker-name>\``
			);
		}

		if (args.key === undefined) {
			throw new UserError(
				"Secret name is required. Please specify the name of your secret."
			);
		}

		const accountId = await requireAuth(config);

		if (
			await confirm(
				`Are you sure you want to permanently delete the secret ${
					args.key
				} on the Worker ${scriptName}${
					args.env && !isLegacyEnv(config) ? ` (${args.env})` : ""
				}?`
			)
		) {
			logger.log(
				`🌀 Deleting the secret ${args.key} on the Worker ${scriptName}${
					args.env && !isLegacyEnv(config) ? ` (${args.env})` : ""
				}`
			);

			// Grab the latest version
			const versions = (
				await fetchResult<{ items: WorkerVersion[] }>(
					config,
					`/accounts/${accountId}/workers/scripts/${scriptName}/versions`
				)
			).items;
			if (versions.length === 0) {
				throw new UserError(
					"There are currently no uploaded versions of this Worker - please upload a version before uploading a secret."
				);
			}
			const latestVersion = versions[0];

			const versionInfo = await fetchResult<VersionDetails>(
				config,
				`/accounts/${accountId}/workers/scripts/${scriptName}/versions/${latestVersion.id}`
			);

			// Go through all
			const newSecrets = versionInfo.resources.bindings
				.filter(
					(binding) =>
						binding.type === "secret_text" && binding.name !== args.key
				)
				.map((binding) => ({
					name: binding.name,
					value: "",
					inherit: true,
				}));

			const newVersion = await copyWorkerVersionWithNewSecrets({
				config,
				accountId,
				scriptName,
				versionId: latestVersion.id,
				secrets: newSecrets,
				versionMessage: args.message ?? `Deleted secret "${args.key}"`,
				versionTag: args.tag,
				sendMetrics: config.send_metrics,
				overrideAllSecrets: true,
			});

			logger.log(
				`✨ Success! Created version ${newVersion.id} with deleted secret ${args.key}.` +
					`\n➡️  To deploy this version without the secret ${args.key} to production traffic use the command "wrangler versions deploy".`
			);
		}
	},
});
