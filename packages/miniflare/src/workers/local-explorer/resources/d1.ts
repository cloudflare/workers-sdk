import { z } from "zod";
import { errorResponse, wrapResponse } from "../common";
import {
	zCloudflareD1GetDatabaseData,
	zCloudflareD1ListDatabasesData,
	zCloudflareD1RawDatabaseQueryData,
} from "../generated/zod.gen";
import type { Env } from "../api.worker";
import type { AppContext } from "../common";
import type {
	D1DatabaseDetailsResponse,
	D1DatabaseResponse,
	D1RawResultResponse,
	D1SingleQuery,
} from "../generated";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get a D1 binding by database ID
 */
function getD1Binding(env: Env, database_id: string): D1Database | null {
	const bindingMap = env.LOCAL_EXPLORER_BINDING_MAP.d1;

	// Find the binding name for this database ID
	const bindingName = bindingMap[database_id];
	if (!bindingName) {
		return null;
	}

	return env[bindingName] as D1Database;
}

/**
 * Get database info (binding name) by database ID
 */
function getDatabaseInfo(env: Env, database_id: string): string | null {
	const bindingMap = env.LOCAL_EXPLORER_BINDING_MAP.d1;
	return bindingMap[database_id] ?? null;
}

// ============================================================================
// API Handlers
// ============================================================================

const _listDatabasesQuerySchema =
	zCloudflareD1ListDatabasesData.shape.query.unwrap();
type ListDatabasesQuery = z.output<typeof _listDatabasesQuerySchema>;

/**
 * List D1 databases
 *
 * https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/list/
 */
export async function listD1Databases(
	c: AppContext,
	query: ListDatabasesQuery
) {
	const { page, per_page, name } = query;

	const d1BindingMap = c.env.LOCAL_EXPLORER_BINDING_MAP.d1;
	let databases = Object.entries(d1BindingMap).map(([id, bindingName]) => {
		// Use the binding name as the database name since we don't have
		// the actual name locally. The ID is the database_id or generated from binding.
		const databaseName = bindingName.split(":").pop() || bindingName;

		return {
			name: databaseName,
			uuid: id,
			version: "production",

			// The following fields are not available locally
			// created_at: undefined,
		} satisfies D1DatabaseResponse;
	});

	// Filter by name if provided
	if (name) {
		databases = databases.filter((db) =>
			db.name?.toLowerCase().includes(name.toLowerCase())
		);
	}

	const totalCount = databases.length;

	// Paginate
	const startIndex = (page - 1) * per_page;
	const endIndex = startIndex + per_page;
	databases = databases.slice(startIndex, endIndex);

	return c.json({
		...wrapResponse(databases),
		result_info: {
			count: databases.length,
			page,
			per_page,
			total_count: totalCount,
		},
	});
}

const _getDatabasePathSchema = zCloudflareD1GetDatabaseData.shape.path;
type GetDatabasePath = z.output<typeof _getDatabasePathSchema>;

/**
 * Get D1 database details
 *
 * https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/
 */
export async function getD1Database(
	c: AppContext,
	path: GetDatabasePath
): Promise<Response> {
	const { database_id } = path;

	const info = getDatabaseInfo(c.env, database_id);
	if (!info) {
		return errorResponse(404, 10000, "Database not found");
	}

	const databaseName = info.split(":").pop() || info;

	const database = {
		name: databaseName,
		uuid: database_id,
		version: "production",

		// The following fields are not available locally
		// created_at: undefined,
		// file_size: undefined,
		// num_tables: undefined,
		// read_replication: undefined,
	} satisfies D1DatabaseDetailsResponse;

	return c.json(wrapResponse(database));
}

const _rawDatabaseBodySchema = zCloudflareD1RawDatabaseQueryData.shape.body;
type RawDatabaseBody = z.output<typeof _rawDatabaseBodySchema>;

/**
 * Raw D1 database query
 *
 * Returns query results as arrays (performance optimized).
 * https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/raw/
 */
export async function rawD1Database(
	c: AppContext,
	body: RawDatabaseBody
): Promise<Response> {
	const database_id = c.req.param("database_id");

	const db = getD1Binding(c.env, database_id);
	if (!db) {
		return errorResponse(404, 10000, "Database not found");
	}

	// Normalize to array of queries
	const queries: D1SingleQuery[] =
		"batch" in body && body.batch ? body.batch : [body as D1SingleQuery];

	const results = new Array<D1RawResultResponse>();

	try {
		for (const query of queries) {
			const startTime = performance.now();

			let statement = db.prepare(query.sql);
			if (query.params && query.params.length > 0) {
				statement = statement.bind(...query.params);
			}

			// Get column names & raw results
			const rawResults = await statement.raw({
				columnNames: true,
			});
			const endTime = performance.now();
			const duration = endTime - startTime;

			// First row contains column names when `columnNames: true`
			const columns = rawResults.length > 0 ? (rawResults[0] as string[]) : [];
			const rows = rawResults.slice(1) as Array<
				Array<number | string | Record<string, unknown>>
			>;

			// For raw queries, we construct basic metadata
			// Note: D1's raw() doesn't return full metadata like all() does
			results.push({
				meta: {
					changed_db: false,
					changes: 0,
					duration: duration,
					last_row_id: 0,
					rows_read: rows.length,
					rows_written: 0,
				},
				results: {
					columns,
					rows,
				},
				success: true,
			} satisfies D1RawResultResponse);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Query failed";
		return errorResponse(500, 10001, message);
	}

	return c.json(wrapResponse(results));
}
