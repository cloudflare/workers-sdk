import { previewDelete } from "@cloudflare/deploy-helpers";
import { createCommand } from "../core/create-command";
import { requireAuth } from "../user";

export const previewDeleteCommand = createCommand({
	metadata: {
		description: "Delete a Preview and all its deployments",
		owner: "Workers: Deploy and Config",
		category: "Compute & AI",
		status: "private beta",
	},
	args: {
		name: {
			describe:
				"Name of the Preview to delete (defaults to current git branch)",
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
	handler: async function previewDeleteHandler(args, { config }) {
		const accountId = await requireAuth(config);
		await previewDelete(accountId, args, config);
	},
});
