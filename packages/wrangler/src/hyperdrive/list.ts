import { createCommand } from "../core/create-command";
import { logger } from "../logger";
import { listConfigs } from "./client";
import { capitalizeScheme, formatCachingOptions } from "./shared";

export const hyperdriveListCommand = createCommand({
	metadata: {
		description: "List Hyperdrive configs",
		status: "stable",
		owner: "Product: Hyperdrive",
		logArgs: true,
	},
	args: {},
	async handler(_, { config }) {
		logger.log(`📋 Listing Hyperdrive configs`);
		const databases = await listConfigs(config);
		logger.table(
			databases.map((database) => ({
				id: database.id,
				name: database.name,
				user: database.origin.user ?? "",
				host: database.origin.host ?? "",
				port: database.origin.port?.toString() ?? "",
				scheme: capitalizeScheme(database.origin.scheme),
				database: database.origin.database ?? "",
				caching: formatCachingOptions(database.caching),
				mtls: JSON.stringify(database.mtls),
				origin_connection_limit:
					database.origin_connection_limit?.toString() ?? "",
			}))
		);
	},
});
