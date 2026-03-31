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
		namespace_name: {
			type: "string",
			demandOption: true,
			description: "The name of the namespace to delete",
		},
		force: {
			type: "boolean",
			alias: "y",
			default: false,
			description: "Skip confirmation",
		},
	},
	positionalArgs: ["namespace_name"],
	async handler({ namespace_name, force }, { config }) {
		if (!force) {
			const confirmedDeletion = await confirm(
				`OK to delete the namespace '${namespace_name}'?`
			);
			if (!confirmedDeletion) {
				logger.log("Deletion cancelled.");
				return;
			}
		}

		await deleteNamespace(config, namespace_name);
		logger.log(`✅ Deleted Agent Memory namespace ${namespace_name}`);
	},
});
