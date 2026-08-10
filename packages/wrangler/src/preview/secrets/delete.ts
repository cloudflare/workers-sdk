import { resolveWorkerName } from "@cloudflare/deploy-helpers";
import chalk from "chalk";
import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import {
	NO_ACTIVE_PREVIEW_URLS_MESSAGE,
	patchPreviewDeploymentSecrets,
	resolvePreviewName,
} from "./index";

export const previewSecretDeleteCommand = createCommand({
	metadata: {
		description:
			"Delete a secret variable from a Worker Preview and create a new deployment",
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
	handler: async function previewSecretDeleteHandler(args, { config }) {
		const workerName = resolveWorkerName(args, config);
		const previewName = resolvePreviewName(args);
		const accountId = await requireAuth(config);

		if (
			args.skipConfirmation ||
			(await confirm(
				`Are you sure you want to permanently delete the secret ${args.key} on the Preview "${previewName}" for the Worker ${workerName}${args.env ? ` (${args.env})` : ""}?`
			))
		) {
			logger.log(
				`🌀 Deleting the secret ${args.key} on the Preview "${previewName}" for the Worker ${workerName}${args.env ? ` (${args.env})` : ""}`
			);

			const deployment = await patchPreviewDeploymentSecrets(
				config,
				accountId,
				workerName,
				previewName,
				{ [args.key]: null },
				{
					message: args.message ?? `Deleted secret "${args.key}"`,
					tag: args.tag,
				},
				{
					noDeployment: "preview secret delete no preview deployment",
					previewNotFound: "preview secret delete preview not found",
				}
			);

			const liveUrls = deployment.urls ?? [];
			logger.log(
				`✨ Success! Created Preview deployment ${deployment.id} with deleted secret ${args.key}.` +
					(liveUrls.length > 0
						? `\n➡️  Your Preview "${previewName}" is now live at ${liveUrls
								.map((url) => chalk.bold.underline(url))
								.join(", ")}`
						: `\n${NO_ACTIVE_PREVIEW_URLS_MESSAGE}`)
			);
		}
	},
});
