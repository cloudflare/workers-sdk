import { APIError, UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import { DEFAULT_MIGRATION_TABLE } from "./constants";
import {
	type DatabaseWithUuid,
	hasUuid,
	type Database,
	type DatabaseInfo,
} from "./types";
import type { ComplianceConfig, Config } from "@cloudflare/workers-utils";

export function getDatabaseInfoFromConfig(
	config: Config,
	nameOrBinding: string
): Database | null {
	for (const d1Database of config.d1_databases) {
		if (
			nameOrBinding === d1Database.database_name ||
			nameOrBinding === d1Database.binding
		) {
			return {
				uuid: d1Database.database_id,
				previewDatabaseUuid: d1Database.preview_database_id,
				binding: d1Database.binding,
				name: d1Database.database_name,
				migrationsTableName:
					d1Database.migrations_table || DEFAULT_MIGRATION_TABLE,
				migrationsDirRaw: d1Database.migrations_dir,
				migrationsPattern: d1Database.migrations_pattern,
				internal_env: d1Database.database_internal_env,
			};
		}
	}
	return null;
}

/** May do an api lookup to fill in uuid. Not suitable for --local mode. */
export const getDatabaseByNameOrBinding = async (
	config: Config,
	accountId: string,
	nameOrBinding: string
): Promise<DatabaseWithUuid> => {
	const dbFromConfig = getDatabaseInfoFromConfig(config, nameOrBinding);
	if (hasUuid(dbFromConfig)) {
		return dbFromConfig;
	}
	// Either not in config at all, or the binding exists but `database_id` is
	// absent (auto-provisioned binding — see Workers automatic resource
	// provisioning). Look up the real UUID via the D1 API.
	const lookupName = dbFromConfig?.name ?? nameOrBinding;
	let uuid: string;
	let name: string;
	try {
		({ uuid, name } = await fetchResult<{ uuid: string; name: string }>(
			config,
			`/accounts/${accountId}/d1/database/${encodeURIComponent(lookupName)}`,
			{},
			new URLSearchParams({ fields: "uuid,name" })
		));
	} catch (err) {
		// Only convert 404 into the friendly "not found" UserError. Anything
		// else (401, 403, 429, 5xx, network) should propagate so the user
		// sees the real failure instead of a misleading "DB not found".
		if (err instanceof APIError && err.status === 404) {
			throw new UserError(
				dbFromConfig
					? `Couldn't find a D1 DB named '${lookupName}' (bound as '${nameOrBinding}') in the API. Run 'wrangler d1 create ${lookupName}' to create it.`
					: `Couldn't find a D1 DB with name or binding '${nameOrBinding}' in your config or the API. Run 'wrangler d1 create ${nameOrBinding}' to create it.`,
				{ telemetryMessage: "d1 database lookup database not found" }
			);
		}
		throw err;
	}

	if (dbFromConfig) {
		// Binding in config but no database_id — merge real uuid from API
		// with migration settings from config.
		return {
			...dbFromConfig,
			name,
			uuid,
		};
	}

	return {
		uuid,
		name,
		binding: nameOrBinding,
		migrationsTableName: DEFAULT_MIGRATION_TABLE,
	};
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
