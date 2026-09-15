import {
	patchPreviewBaseConfig,
	resolveWorkerName,
} from "@cloudflare/deploy-helpers";
import { createCommand } from "../../../core/create-command";
import { logger } from "../../../logger";
import { parseBulkInputToObject } from "../../../secret";
import { requireAuth } from "../../../user";
import { toSecretBindingsPatch } from "../../secrets";
import { rejectUnsupportedPreviewArgs } from ".";

export const previewBaseConfigSecretBulkCommand = createCommand({
	metadata: {
		description: "Upload multiple secrets to the Preview base config",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	positionalArgs: ["file"],
	args: {
		file: {
			describe: "The file of key-value pairs to upload, as JSON or .env format",
			type: "string",
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
	handler: async function previewBaseConfigSecretBulkHandler(args, { config }) {
		const workerName = resolveWorkerName(args, config);
		const accountId = await requireAuth(config);

		logger.log(
			`🌀 Processing the secrets for the Preview base config on the Worker "${workerName}"${args.env ? ` (${args.env})` : ""}`
		);

		const result = await parseBulkInputToObject(args.file, true);

		if (!result) {
			logger.error("🚨 No content found in file, or piped input.");
			return;
		}

		const { content } = result;
		const created = Object.keys(content).filter(
			(name) => content[name] !== null
		);
		const deleted = Object.keys(content).filter(
			(name) => content[name] === null
		);

		await patchPreviewBaseConfig(config, accountId, workerName, {
			env: toSecretBindingsPatch(content),
		});

		for (const name of deleted) {
			logger.log(`💥 Successfully deleted secret for key: ${name}`);
		}
		for (const name of created) {
			logger.log(`✨ Successfully created secret for key: ${name}`);
		}

		logger.log(
			`✨ Success! Updated Preview base config for the Worker "${workerName}" with ${created.length} created and ${deleted.length} deleted secrets.`
		);
	},
});
