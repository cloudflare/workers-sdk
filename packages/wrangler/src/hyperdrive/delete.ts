import { readConfig } from "../config";
import { defineCommand } from "../core";
import { logger } from "../logger";
import { deleteConfig } from "./client";

defineCommand({
	command: "wrangler hyperdrive delete",

	metadata: {
		description: "Delete a Hyperdrive config",
		status: "stable",
		owner: "Product: Hyperdrive",
	},

	args: {
		id: {
			type: "string",
			demandOption: true,
			description: "The ID of the Hyperdrive config",
		},
	},
	positionalArgs: ["id"],

	async handler(args) {
		const config = readConfig(args.config, args);

		logger.log(`🗑️ Deleting Hyperdrive database config ${args.id}`);
		await deleteConfig(config, args.id);
		logger.log(`✅ Deleted`);
	},
});
