import { cloudflareD1RawDatabaseQuery } from "../api";
import { transformStudioArrayBasedResult } from "../utils/studio";
import { StudioSQLiteDriver } from "./sqlite";
import type { D1RawResultResponse } from "../api";
import type {
	IStudioConnection,
	StudioResultSet,
	StudioSchemas,
} from "../types/studio";

/**
 * Local D1 connection that communicates with Miniflare's local explorer API.
 * Uses the generated API client to execute queries.
 */
export class LocalD1Connection implements IStudioConnection {
	/**
	 * @param databaseId - The unique identifier of the D1 database to connect to.
	 */
	constructor(private readonly databaseId: string) {}

	/**
	 * Executes a single SQL statement by delegating to {@link transaction}.
	 *
	 * @param statement - The SQL statement to execute.
	 *
	 * @returns The result set produced by the statement.
	 *
	 * @throws If no result is returned from the query.
	 */
	async query(statement: string): Promise<StudioResultSet> {
		const [result] = await this.transaction([statement]);
		if (!result) {
			throw new Error("No result returned from query");
		}

		return result;
	}

	/**
	 * Executes multiple SQL statements as a single semicolon-joined query
	 * via the D1 raw database API. Trailing semicolons are stripped from
	 * individual statements before joining.
	 *
	 * @param statements - The SQL statements to execute.
	 *
	 * @returns An array of result sets, one per statement.
	 *
	 * @throws If the API response is missing result data.
	 */
	async transaction(statements: string[]): Promise<StudioResultSet[]> {
		const trimmedStatements = statements.map((s) =>
			s.trim().replace(/;+$/, "")
		);

		const response = await cloudflareD1RawDatabaseQuery({
			body: {
				sql: trimmedStatements.join(";"),
			},
			path: {
				database_id: this.databaseId,
			},
		});

		if (!response.data?.result) {
			throw new Error("Invalid response: missing result data");
		}

		return response.data.result.map((result) => this.transformResult(result));
	}

	/**
	 * Transforms a raw D1 API result into a standardised {@link StudioResultSet},
	 * mapping columns, rows, and execution metadata.
	 *
	 * @param result - The raw result object from the D1 API response.
	 *
	 * @returns A normalised result set for use by the studio UI.
	 */
	private transformResult(result: D1RawResultResponse): StudioResultSet {
		return {
			...transformStudioArrayBasedResult({
				headers: result.results?.columns ?? [],
				rows: (result.results?.rows ?? []) as unknown[][],
				transformHeader: (headerName) => ({
					name: headerName,
					displayName: headerName,
				}),
			}),
			lastInsertRowid: result.meta?.last_row_id,
			stat: {
				queryDurationMs: result.meta?.duration ?? null,
				rowsAffected: result.meta?.changes ?? 0,
				rowsRead: result.meta?.rows_read ?? null,
				rowsWritten: result.meta?.rows_written ?? null,
			},
		};
	}
}

/**
 * Local D1 driver that extends the SQLite driver.
 * Filters out internal D1 tables from the schema.
 */
export class LocalD1Driver extends StudioSQLiteDriver {
	/**
	 * @param databaseId - The unique identifier of the D1 database.
	 */
	constructor(databaseId: string) {
		super(new LocalD1Connection(databaseId));
	}

	/**
	 * Retrieves the database schemas, filtering out internal D1 metadata
	 * tables (e.g. `_cf_METADATA`) that should not be exposed to users.
	 *
	 * @returns The filtered schema map.
	 */
	override async schemas(): Promise<StudioSchemas> {
		const result = await super.schemas();

		// Filter out internal D1 tables
		const excludeList = new Set(["_cf_METADATA"]);

		return Object.fromEntries(
			Object.entries(result).map(([schemaName, schemaItems]) => [
				schemaName,
				schemaItems.filter((item) => !excludeList.has(item.name)),
			])
		);
	}
}
