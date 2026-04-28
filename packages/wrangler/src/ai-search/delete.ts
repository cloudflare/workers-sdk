import { createCommand } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { DEFAULT_NAMESPACE, deleteInstance } from "./client";

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
		namespace: {
			type: "string",
			alias: "n",
			default: DEFAULT_NAMESPACE,
			description: "The namespace the instance belongs to.",
		},
		force: {
			type: "boolean",
			alias: "y",
			default: false,
			description: "Skip confirmation",
		},
	},
	positionalArgs: ["name"],
	async handler({ name, namespace, force }, { config }) {
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
		await deleteInstance(config, namespace, name);
		logger.log(`Successfully deleted AI Search instance "${name}"`);
	},
});
