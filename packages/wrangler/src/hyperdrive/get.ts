import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { getConfig } from "./client";

export const hyperdriveGetCommand = createCommand({
	metadata: {
		description: "Get a Hyperdrive config",
		status: "stable",
		owner: "Product: Hyperdrive",
		logArgs: true,
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
		const database = await getConfig(config, id);
		logger.log(JSON.stringify(database, null, 2));
	},
});
