import { resolveWorkerName } from "@cloudflare/deploy-helpers";
import chalk from "chalk";
import { createCommand } from "../../core/create-command";
import { prompt } from "../../dialogs";
import { logger } from "../../logger";
import { requireAuth } from "../../user";
import { readFromStdin, trimTrailingWhitespace } from "../../utils/std";
import {
	NO_ACTIVE_PREVIEW_URLS_MESSAGE,
	patchPreviewDeploymentSecrets,
	resolvePreviewName,
	toSecretBindingsPatch,
} from "./index";

export const previewSecretPutCommand = createCommand({
	metadata: {
		description:
			"Create or update a secret variable on a Worker Preview and create a new deployment",
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
	handler: async function previewSecretPutHandler(args, { config }) {
		const workerName = resolveWorkerName(args, config);
		const previewName = resolvePreviewName(args);
		const accountId = await requireAuth(config);
		const secretValue = trimTrailingWhitespace(
			process.stdin.isTTY
				? await prompt("Enter a secret value:", { isSecret: true })
				: await readFromStdin()
		);

		logger.log(
			`🌀 Creating the secret for the Preview "${previewName}" on the Worker "${workerName}"${args.env ? ` (${args.env})` : ""}`
		);

		const deployment = await patchPreviewDeploymentSecrets(
			config,
			accountId,
			workerName,
			previewName,
			toSecretBindingsPatch({ [args.key]: secretValue }),
			{
				message: args.message ?? `Updated secret "${args.key}"`,
				tag: args.tag,
			},
			{
				noDeployment: "preview secret put no preview deployment",
				previewNotFound: "preview secret put preview not found",
			}
		);

		const liveUrls = deployment.urls ?? [];
		logger.log(
			`✨ Success! Created Preview deployment ${deployment.id} with secret ${args.key}.` +
				(liveUrls.length > 0
					? `\n➡️  Your Preview "${previewName}" is now live at ${liveUrls
							.map((url) => chalk.bold.underline(url))
							.join(", ")}`
					: `\n${NO_ACTIVE_PREVIEW_URLS_MESSAGE}`)
		);
	},
});
