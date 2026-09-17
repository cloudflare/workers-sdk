import {
	patchPreviewBaseConfig,
	resolveWorkerName,
} from "@cloudflare/deploy-helpers";
import { createCommand } from "../../../core/create-command";
import { confirm } from "../../../dialogs";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { rejectUnsupportedPreviewArgs } from ".";

export const previewBaseConfigSecretDeleteCommand = createCommand({
	metadata: {
		description: "Delete a secret variable from the Preview base config",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	positionalArgs: ["key"],
	args: {
		key: {
			describe: "The secret name to delete",
			type: "string",
			demandOption: true,
		},
		"skip-confirmation": {
			describe: "Skip the confirmation prompt",
			type: "boolean",
			default: false,
			alias: "y",
		},
		"worker-name": {
			describe:
				"Name of the Worker to target (defaults to the name in your local config file)",
			type: "string",
			requiresArg: true,
		},
	},
	behaviour: {
		suggestSkillsAfterHandler: true,
	},
	validateArgs: rejectUnsupportedPreviewArgs,
	handler: async function previewBaseConfigSecretDeleteHandler(
		args,
		{ config }
	) {
		const workerName = resolveWorkerName(args, config);
		const accountId = await requireAuth(config);

		if (
			args.skipConfirmation ||
			(await confirm(
				`Are you sure you want to permanently delete the secret ${args.key} on the Preview base config for the Worker ${workerName}${args.env ? ` (${args.env})` : ""}?`
			))
		) {
			logger.log(
				`🌀 Deleting the secret ${args.key} on the Preview base config for the Worker ${workerName}${args.env ? ` (${args.env})` : ""}`
			);

			await patchPreviewBaseConfig(config, accountId, workerName, {
				env: { [args.key]: null },
			});

			logger.log(
				`✨ Success! Updated Preview base config for the Worker "${workerName}" with deleted secret ${args.key}.`
			);
		}
	},
});
