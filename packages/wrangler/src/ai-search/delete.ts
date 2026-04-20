import { createCommand } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { deleteInstance } from "./client";

export const aiSearchDeleteCommand = createCommand({
	metadata: {
		description: "Delete an AI Search instance",
		status: "open beta",
		owner: "Product: AI Search",
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the AI Search instance to delete.",
		},
		force: {
			type: "boolean",
			alias: "y",
			default: false,
			description: "Skip confirmation",
		},
	},
	positionalArgs: ["name"],
	async handler({ name, force }, { config }) {
		if (!force) {
			const confirmedDeletion = await confirm(
				`OK to delete the AI Search instance "${name}"?`
			);
			if (!confirmedDeletion) {
				logger.log("Deletion cancelled.");
				return;
			}
		}

		logger.log(`Deleting AI Search instance "${name}"...`);
		await deleteInstance(config, name);
		logger.log(`Successfully deleted AI Search instance "${name}"`);
	},
});
