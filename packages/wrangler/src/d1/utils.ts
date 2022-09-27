import { listDatabases } from "./list";
import type { Config } from "../config";
import type { Database } from "./types";

export function getDatabaseInfoFromConfig(config: Config, name: string) {
	for (const d1Database of config.d1_databases) {
		if (
			d1Database.database_id &&
			(name === d1Database.database_name || name === d1Database.binding)
		) {
			return {
				uuid: d1Database.database_id,
				binding: d1Database.binding,
				name: d1Database.database_name,
			};
		}
	}
	return null;
}

export const getDatabaseByNameOrBinding = async (
	config: Config,
	accountId: string,
	name: string
): Promise<Database> => {
	const dbFromConfig = getDatabaseInfoFromConfig(config, name);
	if (dbFromConfig) return dbFromConfig;

	const allDBs = await listDatabases(accountId);
	const matchingDB = allDBs.find((db) => db.name === name);
	if (!matchingDB) {
		throw new Error(`Couldn't find DB with name '${name}'`);
	}
	return matchingDB;
};

export const d1BetaWarning = process.env.NO_D1_WARNING
	? ""
	: "🚧 'wrangler d1 <command>' is a beta command. Please report any issues to https://github.com/cloudflare/wrangler2/issues/new/choose";
