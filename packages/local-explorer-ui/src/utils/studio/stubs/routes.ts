/**
 * Configurable API endpoints for Studio drivers
 *
 * This stub provides endpoint templates that can be configured
 * for your own API backend.
 */

import { route } from "@cloudflare/util-routes";

/**
 * D1 Database API endpoints
 * These point to Cloudflare's D1 API by default
 */
export const d1Endpoints = {
	databases: route`/accounts/${"accountId"}/d1/database`,
	database: route`/accounts/${"accountId"}/d1/database/${"databaseId"}`,
	databaseLimits: route`/accounts/${"accountId"}/d1/database/${"databaseId"}/limits`,
	tables: route`/accounts/${"accountId"}/d1/database/${"databaseId"}/table`,
	table: route`/accounts/${"accountId"}/d1/database/${"databaseId"}/table/${"tableName"}`,
	query: route`/accounts/${"accountId"}/d1/database/${"databaseId"}/query`,
	raw: route`/accounts/${"accountId"}/d1/database/${"databaseId"}/raw`,
	backups: route`/accounts/${"accountId"}/d1/database/${"databaseId"}/backup`,
	restore: route`/accounts/${"accountId"}/d1/database/${"databaseId"}/backup/${"backupId"}/restore`,
	download: route`/accounts/${"accountId"}/d1/database/${"databaseId"}/backup/${"backupId"}/download`,
	bookmark: route`/accounts/${"accountId"}/d1/database/${"databaseId"}/time_travel/bookmark`,
	restoreBookmark: route`/accounts/${"accountId"}/d1/database/${"databaseId"}/time_travel/restore`,
};

/**
 * Durable Objects API endpoints
 */
export const doEndpoints = {
	namespaces: route`/accounts/${"accountId"}/workers/durable_objects/namespaces`,
	namespace: route`/accounts/${"accountId"}/workers/durable_objects/namespaces/${"namespaceId"}`,
	rawObjectQuery: route`/accounts/${"accountId"}/workers/durable_objects/namespaces/${"namespaceId"}/objects/${"objectId"}/query`,
	rawNameQuery: route`/accounts/${"accountId"}/workers/durable_objects/namespaces/${"namespaceId"}/query`,
};

/**
 * Worker Analytics Engine (WAE) endpoints
 */
export const waeEndpoints = {
	query: route`/accounts/${"accountId"}/analytics_engine/sql`,
};

// Re-export for compatibility with original D1 routes import
export const endpoints = d1Endpoints;
export const routes = {
	root: route`/${"accountId"}/workers/d1`,
	createDatabase: route`/${"accountId"}/workers/d1/create`,
	databaseDetails: route`/${"accountId"}/workers/d1/databases/${"databaseId"}`,
	databaseSettings: route`/${"accountId"}/workers/d1/databases/${"databaseId"}/settings`,
	databaseConsole: route`/${"accountId"}/workers/d1/databases/${"databaseId"}/console`,
	backups: route`/${"accountId"}/workers/d1/databases/${"databaseId"}/backups`,
	metrics: route`/${"accountId"}/workers/d1/databases/${"databaseId"}/metrics`,
	timeTravel: route`/${"accountId"}/workers/d1/databases/${"databaseId"}/time-travel`,
	studio: route`/${"accountId"}/workers/d1/databases/${"databaseId"}/studio`,
} as const;
