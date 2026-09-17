import {
	patchPreviewBaseConfig,
	resolveWorkerName,
} from "@cloudflare/deploy-helpers";
import { createCommand } from "../../../core/create-command";
import { prompt } from "../../../dialogs";
import { logger } from "../../../logger";
import { requireAuth } from "../../../user";
import { readFromStdin, trimTrailingWhitespace } from "../../../utils/std";
import { toSecretBindingsPatch } from "../../secrets";
import { rejectUnsupportedPreviewArgs } from ".";

export const previewBaseConfigSecretPutCommand = createCommand({
	metadata: {
		description:
			"Create or update a secret variable on the Preview base config",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	positionalArgs: ["key"],
	args: {
		key: {
			describe: "The secret name to be accessible in the Worker",
			type: "string",
			demandOption: true,
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
	handler: async function previewBaseConfigSecretPutHandler(args, { config }) {
		const workerName = resolveWorkerName(args, config);
		const accountId = await requireAuth(config);
		const secretValue = trimTrailingWhitespace(
			process.stdin.isTTY
				? await prompt("Enter a secret value:", { isSecret: true })
				: await readFromStdin()
		);

		logger.log(
			`🌀 Creating the secret for the Preview base config on the Worker "${workerName}"${args.env ? ` (${args.env})` : ""}`
		);

		await patchPreviewBaseConfig(config, accountId, workerName, {
			env: toSecretBindingsPatch({ [args.key]: secretValue }),
		});

		logger.log(
			`✨ Success! Updated Preview base config for the Worker "${workerName}" with secret ${args.key}.`
		);
	},
});
