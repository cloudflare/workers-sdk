import { APIError, UserError } from "@cloudflare/workers-utils";
import { dedent } from "ts-dedent";
import { fetchResult } from "../cfetch";
import { autoProvisionedResourceName } from "../deployment-bundle/auto-provisioned-name";
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
	//
	let lookupName: string;
	if (dbFromConfig?.name) {
		// Config has `database_name` — use it directly.
		lookupName = dbFromConfig.name;
	} else if (dbFromConfig) {
		// Binding is in config but has no `database_name`. Use the name
		// `wrangler deploy` would create (`<worker name>-<binding>`),
		// if the worker has a `name`.
		if (config.name) {
			lookupName = autoProvisionedResourceName(
				config.name,
				dbFromConfig.binding
			);
		} else {
			// No worker name, no database_name, no database_id — there's no
			// way to pick out which D1 database the binding refers to. Refuse
			// rather than silently falling back to nameOrBinding, which could
			// bind to an unrelated DB on the account that happens to share
			// the binding name.
			throw new UserError(
				dedent`Found a database binding named '${nameOrBinding}' but it has no 'database_name' or 'database_id', and the worker has no 'name'.

				In order to connect to an existing database, please specify either 'database_name' or 'database_id' in the binding.

				Alternatively specify a 'name' for the worker and then run 'wrangler deploy'. This will auto-provision a database named '${autoProvisionedResourceName("<worker-name>", nameOrBinding)}'.
				`,
				{
					telemetryMessage: "d1 database lookup missing name and id",
				}
			);
		}
	} else {
		// Not in config at all — treat `nameOrBinding` as a literal name
		// (e.g. `wrangler d1 execute <db-name>` with no matching config entry).
		lookupName = nameOrBinding;
	}

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
			if (dbFromConfig?.name) {
				throw new UserError(
					`Couldn't find a D1 DB named '${lookupName}' (bound as '${nameOrBinding}') in the API. Run 'wrangler d1 create ${lookupName}' to create it.`,
					{ telemetryMessage: "d1 database lookup database not found" }
				);
			}
			if (dbFromConfig) {
				// Binding-only config — `lookupName` is the auto-provisioned
				// guess. The DB doesn't exist yet, so point the user at
				// `wrangler deploy` rather than `wrangler d1 create`.
				throw new UserError(
					`Couldn't find an auto-provisioned D1 DB named '${lookupName}' for binding '${nameOrBinding}'. Run 'wrangler deploy' to provision it, or add 'database_name' / 'database_id' to your config.`,
					{
						telemetryMessage:
							"d1 database lookup auto-provisioned database not found",
					}
				);
			}
			throw new UserError(
				`Couldn't find a D1 DB with name or binding '${nameOrBinding}' in your config or the API. Run 'wrangler d1 create ${nameOrBinding}' to create it.`,
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

// Keep in sync with the local provisioning copy in
// packages/deploy-helpers/src/deploy/helpers/provision-bindings.ts.
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
