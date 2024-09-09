import { readConfig } from "../config";
import { defineCommand } from "../core";
import { logger } from "../logger";
import { getConfig } from "./client";

defineCommand({
	command: "wrangler hyperdrive get",

	metadata: {
		description: "Get a Hyperdrive config",
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

		const database = await getConfig(config, args.id);
		logger.log(JSON.stringify(database, null, 2));
	},
});
