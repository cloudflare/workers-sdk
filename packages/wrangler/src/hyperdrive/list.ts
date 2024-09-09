import { readConfig } from "../config";
import { defineCommand } from "../core";
import { logger } from "../logger";
import { listConfigs } from "./client";

defineCommand({
	command: "wrangler hyperdrive list",

	metadata: {
		description: "List Hyperdrive configs",
		status: "stable",
		owner: "Product: Hyperdrive",
	},

	args: {},

	async handler(args) {
		const config = readConfig(args.config, args);

		logger.log(`📋 Listing Hyperdrive configs`);
		const databases = await listConfigs(config);
		logger.table(
			databases.map((database) => ({
				id: database.id,
				name: database.name,
				user: database.origin.user ?? "",
				host: database.origin.host ?? "",
				port: database.origin.port?.toString() ?? "",
				database: database.origin.database ?? "",
				caching: JSON.stringify(database.caching),
			}))
		);
	},
});
