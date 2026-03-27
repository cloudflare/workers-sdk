import { createCommand } from "../core/create-command";
import { confirm } from "../dialogs";
import { logger } from "../logger";
import { deleteNamespace } from "./client";

export const agentMemoryNamespaceDeleteCommand = createCommand({
	metadata: {
		description: "Delete a given Agent Memory namespace",
		status: "open beta",
		owner: "Product: Agent Memory",
	},
	args: {
		namespace_id: {
			type: "string",
			demandOption: true,
			description: "The ID of the namespace to delete",
		},
		force: {
			type: "boolean",
			alias: "y",
			default: false,
			description: "Skip confirmation",
		},
	},
	positionalArgs: ["namespace_id"],
	async handler({ namespace_id, force }, { config }) {
		if (!force) {
			const confirmedDeletion = await confirm(
				`OK to delete the namespace '${namespace_id}'?`
			);
			if (!confirmedDeletion) {
				logger.log("Deletion cancelled.");
				return;
			}
		}

		await deleteNamespace(config, namespace_id);
		logger.log(`✅ Deleted Agent Memory namespace ${namespace_id}`);
	},
});
