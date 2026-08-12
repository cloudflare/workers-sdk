import { resolveWorkerName } from "@cloudflare/deploy-helpers";
import chalk from "chalk";
import { createCommand } from "../../core/create-command";
import { logger } from "../../logger";
import { parseBulkInputToObject } from "../../secret";
import { requireAuth } from "../../user";
import {
	NO_ACTIVE_PREVIEW_URLS_MESSAGE,
	patchPreviewDeploymentSecrets,
	resolvePreviewName,
	toSecretBindingsPatch,
} from "./index";

export const previewSecretBulkCommand = createCommand({
	metadata: {
		description:
			"Upload multiple secrets to a Worker Preview and create a new deployment",
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
		name: {
			describe: "Name of the Preview (defaults to current git branch)",
			type: "string",
			requiresArg: true,
		},
		message: {
			describe: "A descriptive message for this Preview deployment",
			type: "string",
			requiresArg: true,
		},
		tag: {
			describe: "A tag for this Preview deployment",
			type: "string",
			requiresArg: true,
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
	handler: async function previewSecretBulkHandler(args, { config }) {
		const workerName = resolveWorkerName(args, config);
		const previewName = resolvePreviewName(args);
		const accountId = await requireAuth(config);

		logger.log(
			`🌀 Processing the secrets for the Preview "${previewName}" on the Worker "${workerName}"${args.env ? ` (${args.env})` : ""}`
		);

		// includeNull: true to delete empty secrets - matches wrangler secret bulk
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

		const deployment = await patchPreviewDeploymentSecrets(
			config,
			accountId,
			workerName,
			previewName,
			toSecretBindingsPatch(content),
			{
				message:
					args.message ??
					`Created ${created.length} and deleted ${deleted.length} secrets`,
				tag: args.tag,
			},
			{
				noDeployment: "preview secret bulk no preview deployment",
				previewNotFound: "preview secret bulk preview not found",
			}
		);

		for (const name of deleted) {
			logger.log(`💥 Successfully deleted secret for key: ${name}`);
		}
		for (const name of created) {
			logger.log(`✨ Successfully created secret for key: ${name}`);
		}

		const liveUrls = deployment.urls ?? [];
		logger.log(
			`✨ Success! Created Preview deployment ${deployment.id} with ${created.length} created and ${deleted.length} deleted secrets.` +
				(liveUrls.length > 0
					? `\n➡️  Your Preview "${previewName}" is now live at ${liveUrls
							.map((url) => chalk.bold.underline(url))
							.join(", ")}`
					: `\n${NO_ACTIVE_PREVIEW_URLS_MESSAGE}`)
		);
	},
});
