import {
	aggregateListResults,
	fetchFromPeer,
	getPeerUrlsIfAggregating,
} from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import type { AppContext } from "../common";
import type { Env } from "../explorer.worker";
import type {
	D1DatabaseResponse,
	D1RawResultResponse,
	D1SingleQuery,
} from "../generated";
import type {
	zD1ListDatabasesData,
	zD1RawDatabaseQueryData,
} from "../generated/zod.gen";
import type { z } from "zod";

// ============================================================================
// Error Codes (matching Cloudflare API)
// ============================================================================

/** Error code for D1 database not found */
const D1_ERROR_DATABASE_NOT_FOUND = 7404;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Retrieves a D1 database binding from the environment by its database ID.
 *
 * Looks up the binding name in the local explorer binding map and returns
 * the corresponding D1Database instance from the environment.
 *
 * @param env - The worker environment containing bindings and configuration
 * @param databaseId - The unique identifier of the D1 database
 *
 * @returns The `D1Database` binding if found, or `null` if the database ID is not mapped
 */
function getD1Binding(env: Env, databaseId: string): D1Database | null {
	const bindingMap = env.LOCAL_EXPLORER_BINDING_MAP.d1;

	// Find the binding name for this database ID
	const bindingName = bindingMap[databaseId];
	if (!bindingName) {
		return null;
	}

	return env[bindingName] as D1Database;
}

/**
 * D1 database response extended with worker name for filtering in the UI.
 */
type D1DatabaseWithWorker = D1DatabaseResponse & {
	workerName: string;
};

/**
 * Get local D1 databases from the binding map.
 * Each database is tagged with the worker name it belongs to.
 */
function getLocalD1Databases(env: Env): D1DatabaseWithWorker[] {
	const d1BindingMap = env.LOCAL_EXPLORER_BINDING_MAP.d1;

	return Object.entries(d1BindingMap).map(([id, bindingName]) => {
		// Binding names follow the pattern "MINIFLARE_PROXY:d1:workerName:BINDING"
		const parts = bindingName.split(":");
		const workerName = parts.length >= 3 ? parts[2] : "unknown";
		const databaseName = parts.pop() || bindingName;

		return {
			name: databaseName,
			uuid: id,
			version: "production",
			workerName,
		} satisfies D1DatabaseWithWorker;
	});
}

async function findD1DatabaseOwner(
	c: AppContext,
	databaseId: string
): Promise<string | null> {
	const peerUrls = await getPeerUrlsIfAggregating(c);
	if (peerUrls.length === 0) return null;

	const responses = await Promise.all(
		peerUrls.map(async (url) => {
			const response = await fetchFromPeer(url, "/d1/database");
			if (!response?.ok) return null;
			const data = (await response.json()) as {
				result?: Array<{ uuid: string }>;
			};
			const found = data.result?.some((db) => db.uuid === databaseId);
			return found ? url : null;
		})
	);

	return responses.find((url) => url !== null) ?? null;
}

// ============================================================================
// API Handlers
// ============================================================================

type ListDatabasesQuery = z.output<
	ReturnType<typeof zD1ListDatabasesData.shape.query.unwrap>
>;

/**
 * Lists all D1 databases available across all connected instances.
 *
 * This is an aggregated endpoint - it fetches databases from the local instance
 * and all peer instances in the dev registry, then merges the results.
 *
 * Supports filtering by database name via the `name` query parameter.
 *
 * @see https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/list/
 *
 * @param c - The Hono application context
 * @param query - Query parameters for filtering
 * @param query.name - Optional filter to search databases by name (case-insensitive)
 *
 * @returns A JSON response containing all databases from all instances
 */
export async function listD1Databases(
	c: AppContext,
	query: ListDatabasesQuery
): Promise<Response> {
	const { name } = query;

	const localDatabases = getLocalD1Databases(c.env);
	const aggregatedDatabases = await aggregateListResults(
		c,
		localDatabases,
		"/d1/database"
	);

	// deduplicate by id - not totally correct, since local dev can use binding names as an 'id' :/
	// TODO: check persistence path to properly verify local uniqueness
	const localIds = new Set(localDatabases.map((db) => db.uuid));
	let allDatabases = aggregatedDatabases.filter(
		(db, index) => index < localDatabases.length || !localIds.has(db.uuid)
	);

	// Filter by name if provided
	if (name) {
		allDatabases = allDatabases.filter((db) =>
			db.name?.toLowerCase().includes(name.toLowerCase())
		);
	}

	return c.json({
		...wrapResponse(allDatabases),
		result_info: {
			count: allDatabases.length,
		},
	});
}

type RawDatabaseBody = z.output<typeof zD1RawDatabaseQueryData.shape.body>;

/**
 * Executes raw SQL queries against a D1 database.
 *
 * Returns query results as arrays rather than objects for improved performance.
 *
 * Supports both single queries and batch queries. Each query can include
 * parameterized values for safe SQL execution.
 *
 * If the database is not found locally, this handler will attempt to proxy
 * the request to peer instances in the dev registry.
 *
 * @see https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/raw/
 *
 * @param c - The Hono application context (`database_id` is extracted from the request path)
 * @param body - The request body containing the SQL query or batch of queries
 * @param body.sql - The SQL statement to execute (for single queries)
 * @param body.params - Optional array of parameters for the SQL statement
 * @param body.batch - Optional array of queries to execute as a batch
 *
 * @returns A JSON response with query results including columns, rows, and metadata,
 *          or a 404 error if the database is not found, or a 500 error if the query fails
 */
export async function rawD1Database(
	c: AppContext,
	databaseId: string,
	body: RawDatabaseBody
): Promise<Response> {
	// Try local first
	const db = getD1Binding(c.env, databaseId);
	if (db) {
		return executeD1Query(c, db, body);
	}

	const ownerMiniflare = await findD1DatabaseOwner(c, databaseId);
	if (ownerMiniflare) {
		const response = await fetchFromPeer(
			ownerMiniflare,
			`/d1/database/${encodeURIComponent(databaseId)}/raw`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			}
		);
		if (response) return response;
	}

	return errorResponse(
		404,
		D1_ERROR_DATABASE_NOT_FOUND,
		`The database ${databaseId} could not be found`
	);
}

/**
 * Execute a D1 query against a local database binding.
 */
async function executeD1Query(
	c: AppContext,
	db: D1Database,
	body: RawDatabaseBody
): Promise<Response> {
	// Normalize to array of queries
	const queries: D1SingleQuery[] =
		"batch" in body && body.batch ? body.batch : [body as D1SingleQuery];

	const results = new Array<D1RawResultResponse>();

	try {
		for (const query of queries) {
			let statement = db.prepare(query.sql);
			if (query.params && query.params.length > 0) {
				statement = statement.bind(...query.params);
			}

			// Note: We use `.all()` here instead of `.raw()` so we can get the full
			// query metadata back. As such we then need to transform the data to match
			// the required raw request format.
			const allResults = await statement.all();

			const columns =
				allResults.results.length > 0 ? Object.keys(allResults.results[0]) : [];

			const rows = allResults.results.map((row) =>
				columns.map(
					(col) => row[col] as number | string | Record<string, unknown>
				)
			);

			results.push({
				meta: {
					changed_db: allResults.meta.changed_db,
					changes: allResults.meta.changes,
					duration: allResults.meta.duration,
					last_row_id: allResults.meta.last_row_id,
					rows_read: allResults.meta.rows_read,
					rows_written: allResults.meta.rows_written,
					size_after: allResults.meta.size_after,
					timings: allResults.meta.timings,
				},
				results: {
					columns,
					rows,
				},
				success: allResults.success,
			} satisfies D1RawResultResponse);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Query failed";
		return errorResponse(500, 10001, message);
	}

	return c.json(wrapResponse(results));
}
