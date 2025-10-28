import { UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import { DEFAULT_MIGRATION_PATH, DEFAULT_MIGRATION_TABLE } from "./constants";
import { listDatabases } from "./list";
import type { ComplianceConfig } from "../environment-variables/misc-variables";
import type { Database, DatabaseInfo } from "./types";
import type { Config } from "@cloudflare/workers-utils";

export function getDatabaseInfoFromConfig(
	config: Config,
	name: string
): Database | null {
	for (const d1Database of config.d1_databases) {
		if (
			d1Database.database_id &&
			(name === d1Database.database_name || name === d1Database.binding)
		) {
			return {
				uuid: d1Database.database_id,
				previewDatabaseUuid: d1Database.preview_database_id,
				binding: d1Database.binding,
				name: d1Database.database_name,
				migrationsTableName:
					d1Database.migrations_table || DEFAULT_MIGRATION_TABLE,
				migrationsFolderPath:
					d1Database.migrations_dir || DEFAULT_MIGRATION_PATH,
				internal_env: d1Database.database_internal_env,
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
	if (dbFromConfig) {
		return dbFromConfig;
	}

	const allDBs = await listDatabases(config, accountId);
	const matchingDB = allDBs.find((db) => db.name === name);
	if (!matchingDB) {
		throw new UserError(`Couldn't find DB with name '${name}'`);
	}
	return matchingDB;
};

export const getDatabaseInfoFromIdOrName = async (
	complianceConfig: ComplianceConfig,
	accountId: string,
	databaseIdOrName: string
): Promise<DatabaseInfo> => {
	return await fetchResult<DatabaseInfo>(
		complianceConfig,
		`/accounts/${accountId}/d1/database/${databaseIdOrName}`,
		{
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
};
