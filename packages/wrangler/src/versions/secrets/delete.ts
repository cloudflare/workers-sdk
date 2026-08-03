import { configFileName, UserError } from "@cloudflare/workers-utils";
import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { getLegacyScriptName } from "../../utils/getLegacyScriptName";
import { patchLatestWorkerVersionWithSecrets } from "./index";

export const versionsSecretDeleteCommand = createCommand({
	metadata: {
		description: "Delete a secret variable from a Worker",
		owner: "Workers: Authoring and Testing",
		status: "stable",
	},
	behaviour: {
		supportTemporary: true,
		printConfigWarnings: false,
		warnIfMultipleEnvsConfiguredButNoneSpecified: true,
		suggestSkillsAfterHandler: true,
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
				`Required Worker name missing. Please specify the Worker name in your ${configFileName(config.configPath)} file, or pass it as an argument with \`--name <worker-name>\``,
				{ telemetryMessage: "versions secrets delete missing worker name" }
			);
		}

		if (args.key === undefined) {
			throw new UserError(
				"Secret name is required. Please specify the name of your secret.",
				{ telemetryMessage: "versions secrets delete missing secret name" }
			);
		}

		const accountId = await requireAuth(config);

		if (
			await confirm(
				`Are you sure you want to permanently delete the secret ${
					args.key
				} on the Worker ${scriptName}${args.env ? ` (${args.env})` : ""}?`
			)
		) {
			logger.log(
				`🌀 Deleting the secret ${args.key} on the Worker ${scriptName}${
					args.env ? ` (${args.env})` : ""
				}`
			);

			const newVersion = await patchLatestWorkerVersionWithSecrets({
				config,
				accountId,
				scriptName,
				secrets: { [args.key]: null },
				versionMessage: args.message ?? `Deleted secret "${args.key}"`,
				versionTag: args.tag,
				sendMetrics: config.send_metrics,
				noVersionsTelemetryMessage:
					"versions secrets delete no uploaded versions",
			});

			logger.log(
				`✨ Success! Created version ${newVersion.id} with deleted secret ${args.key}.` +
					`\n➡️  To deploy this version without the secret ${args.key} to production traffic use the command "wrangler versions deploy".`
			);
		}
	},
});
