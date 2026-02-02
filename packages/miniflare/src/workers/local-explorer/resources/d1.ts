import { z } from "zod";
import { errorResponse, wrapResponse } from "../common";
import {
	zCloudflareD1ListDatabasesData,
	zCloudflareD1RawDatabaseQueryData,
} from "../generated/zod.gen";
import type { Env } from "../api.worker";
import type { AppContext } from "../common";
import type {
	D1DatabaseResponse,
	D1RawResultResponse,
	D1SingleQuery,
} from "../generated";

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

// ============================================================================
// API Handlers
// ============================================================================

type ListDatabasesQuery = z.output<
	ReturnType<typeof zCloudflareD1ListDatabasesData.shape.query.unwrap>
>;

/**
 * Lists all D1 databases available in the local environment.
 *
 * Returns a paginated list of databases with their names and UUIDs.
 * Supports filtering by database name and pagination via query parameters.
 *
 * @see https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/list/
 *
 * @param c - The Hono application context
 * @param query - Query parameters for filtering and pagination
 * @param query.page - The page number for pagination
 * @param query.per_page - The number of results per page
 * @param query.name - Optional filter to search databases by name (case-insensitive)
 *
 * @returns A JSON response containing the list of databases and pagination info
 */
export async function listD1Databases(
	c: AppContext,
	query: ListDatabasesQuery
) {
	const { page, per_page, name } = query;

	const d1BindingMap = c.env.LOCAL_EXPLORER_BINDING_MAP.d1;
	let databases = Object.entries(d1BindingMap).map(([id, bindingName]) => {
		// Use the binding name as the database name since we don't have
		// the actual name locally. The ID is the `database_id` or generated from binding.
		const databaseName = bindingName.split(":").pop() || bindingName;

		return {
			name: databaseName,
			uuid: id,
			version: "production",
		} satisfies D1DatabaseResponse;
	});

	const totalCount = databases.length;

	// Filter by name if provided
	if (name) {
		databases = databases.filter((db) =>
			db.name?.toLowerCase().includes(name.toLowerCase())
		);
	}

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

type RawDatabaseBody = z.output<
	typeof zCloudflareD1RawDatabaseQueryData.shape.body
>;

/**
 * Executes raw SQL queries against a D1 database.
 *
 * Returns query results as arrays rather than objects for improved performance.
 *
 * Supports both single queries and batch queries. Each query can include
 * parameterized values for safe SQL execution.
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
	body: RawDatabaseBody
): Promise<Response> {
	const databaseId = c.req.param("database_id");

	const db = getD1Binding(c.env, databaseId);
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
			// Note: D1's `statement.raw()` doesn't return full metadata like `statement.all()` does
			results.push({
				meta: {
					changed_db: false,
					duration: duration,
					rows_read: rows.length,
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
