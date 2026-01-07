import { UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import { DEFAULT_MIGRATION_PATH, DEFAULT_MIGRATION_TABLE } from "./constants";
import { listDatabases } from "./list";
import type { Database, DatabaseInfo } from "./types";
import type { ComplianceConfig, Config } from "@cloudflare/workers-utils";

export function getDatabaseInfoFromConfig(
	config: Config,
	name: string,
	options?: {
		/** Local databases might not have a database id, so we don't require it for local-only operations */
		requireDatabaseId?: boolean;
	}
): Database | null {
	const requireDatabaseId = options?.requireDatabaseId ?? true;

	for (const d1Database of config.d1_databases) {
		if (name === d1Database.database_name || name === d1Database.binding) {
			if (requireDatabaseId && !d1Database.database_id) {
				throw new UserError(
					`Found a database with name or binding ${name} but it is missing a database_id, which is needed for operations on remote resources. Please create the remote D1 database by deploying your project or running 'wrangler d1 create ${name}'.`
				);
			}
			// If requireDatabaseId is true (default), skip entries without database_id
			// This is needed for remote operations that require a real database UUID

			// For local operations, fall back to using the binding as the ID
			// This matches the behavior in wrangler dev (see d1DatabaseEntry in dev/miniflare/index.ts)
			const uuid = d1Database.database_id ?? d1Database.binding;

			return {
				uuid,
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
