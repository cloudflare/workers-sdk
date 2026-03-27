import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { deleteConfig } from "./client";

export const hyperdriveDeleteCommand = createCommand({
	metadata: {
		description: "Delete a Hyperdrive config",
		status: "stable",
		owner: "Product: Hyperdrive",
	},
	behaviour: {
		skipConfigValidationErrors: true,
	},
	args: {
		id: {
			type: "string",
			demandOption: true,
			description: "The ID of the Hyperdrive config",
		},
	},
	positionalArgs: ["id"],
	async handler({ id }, { config }) {
		logger.log(`🗑️ Deleting Hyperdrive database config ${id}`);
		await deleteConfig(config, id);
		logger.log(`✅ Deleted`);
	},
});
