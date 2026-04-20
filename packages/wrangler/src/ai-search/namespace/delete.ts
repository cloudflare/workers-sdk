import { createCommand } from "../../core/create-command";
import { confirm } from "../../dialogs";
import { logger } from "../../logger";
import { deleteNamespace } from "../client";

export const aiSearchNamespaceDeleteCommand = createCommand({
	metadata: {
		description: "Delete an AI Search namespace",
		status: "open beta",
		owner: "Product: AI Search",
	},
	args: {
		name: {
			type: "string",
			demandOption: true,
			description: "The name of the AI Search namespace to delete.",
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
				`OK to delete the AI Search namespace "${name}"? This will also remove all instances inside it.`
			);
			if (!confirmedDeletion) {
				logger.log("Deletion cancelled.");
				return;
			}
		}

		logger.log(`Deleting AI Search namespace "${name}"...`);
		await deleteNamespace(config, name);
		logger.log(`Successfully deleted AI Search namespace "${name}"`);
	},
});
