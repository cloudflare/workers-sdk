import {
	previewSettingsGet,
	previewSettingsUpdate,
} from "@cloudflare/deploy-helpers";
import { createCommand } from "../core/create-command";
import { requireAuth } from "../user";

export const previewSettingsUpdateCommand = createCommand({
	metadata: {
		description:
			"Update the Worker's Previews settings using the contents of the Wrangler config file",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	args: {
		"worker-name": {
			describe:
				"Name of the Worker to target (defaults to the name in your local config file)",
			type: "string",
			requiresArg: true,
		},
		"skip-confirmation": {
			describe: "Skip the confirmation prompt",
			type: "boolean",
			default: false,
			alias: "y",
		},
	},
	behaviour: {
		suggestSkillsAfterHandler: true,
	},
	handler: async function previewSettingsUpdateHandler(args, { config }) {
		const accountId = await requireAuth(config);
		await previewSettingsUpdate(accountId, args, config);
	},
});

export const previewSettingsCommand = createCommand({
	metadata: {
		description: "Show the current Previews settings for a Worker",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	args: {
		"worker-name": {
			describe:
				"Name of the Worker to target (defaults to the name in your local config file)",
			type: "string",
			requiresArg: true,
		},
		json: {
			describe: "Return output as JSON",
			type: "boolean",
			default: false,
		},
	},
	behaviour: {
		printBanner: (args) => args.json !== true,
		suggestSkillsAfterHandler: (args) => args.json !== true,
	},
	handler: async function previewSettingsHandler(args, { config }) {
		const accountId = await requireAuth(config);
		await previewSettingsGet(accountId, args, config);
	},
});
