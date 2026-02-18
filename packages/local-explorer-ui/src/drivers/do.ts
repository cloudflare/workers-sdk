import { durableObjectsNamespaceQuerySqlite } from "../api";
import { transformStudioArrayBasedResult } from "../utils/studio";
import { StudioSQLiteDriver } from "./sqlite";
import type { DoRawQueryResult } from "../api";
import type {
	IStudioConnection,
	StudioResultSet,
	StudioSchemas,
} from "../types/studio";

/**
 * Local Durable Object connection that communicates with Miniflare's local explorer API.
 * Uses the generated API client to execute queries against a specific Durable Object's
 * SQLite storage.
 */
export class LocalDOConnection implements IStudioConnection {
	/**
	 * @param namespaceId - The unique identifier of the DO namespace (format: `{scriptName}-{className}`).
	 * @param objectId - The hex string ID of the Durable Object (mutually exclusive with objectName).
	 * @param objectName - The name to derive DO ID via `idFromName()` (mutually exclusive with objectId).
	 *
	 * @throws If neither `objectId` nor `objectName` is provided.
	 */
	constructor(
		private readonly namespaceId: string,
		private readonly objectId?: string | null,
		private readonly objectName?: string | null
	) {
		if (!objectId && !objectName) {
			throw new Error(
				"Either `objectId` or `objectName` must be provided to identify the Durable Object"
			);
		}
	}

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
	 * Executes multiple SQL statements as a transaction via the Durable Objects
	 * query API. Trailing semicolons are stripped from individual statements.
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

		const queries = trimmedStatements.map((sql) => ({ sql }));

		// Build request body based on whether we have an ID or name
		const body = this.objectId
			? { durable_object_id: this.objectId, queries }
			: { durable_object_name: this.objectName as string, queries };

		const response = await durableObjectsNamespaceQuerySqlite({
			body,
			path: {
				namespace_id: this.namespaceId,
			},
		});
		if (!response.data?.result) {
			throw new Error("Invalid response: missing result data");
		}

		return response.data.result.map((result) => this.transformResult(result));
	}

	/**
	 * Transforms a raw DO API result into a standardised {@link StudioResultSet},
	 * mapping columns, rows, and execution metadata.
	 *
	 * @param result - The raw result object from the DO query API response.
	 *
	 * @returns A normalised result set for use by the studio UI.
	 */
	private transformResult(result: DoRawQueryResult): StudioResultSet {
		return {
			...transformStudioArrayBasedResult({
				headers: result.columns ?? [],
				rows: (result.rows ?? []) as unknown[][],
				transformHeader: (headerName) => ({
					name: headerName,
					displayName: headerName,
				}),
			}),
			stat: {
				queryDurationMs: null,
				rowsAffected: 0,
				rowsRead: result.meta?.rows_read ?? null,
				rowsWritten: result.meta?.rows_written ?? null,
			},
		};
	}
}

/**
 * Local Durable Object driver that extends the SQLite driver.
 * Filters out internal DO tables from the schema.
 */
export class LocalDODriver extends StudioSQLiteDriver {
	/**
	 * @param namespaceId - The unique identifier of the DO namespace (format: `{scriptName}-{className}`).
	 * @param objectId - The hex string ID of the Durable Object (mutually exclusive with objectName).
	 * @param objectName - The name to derive DO ID via `idFromName()` (mutually exclusive with objectId).
	 */
	constructor(
		namespaceId: string,
		objectId?: string | null,
		objectName?: string | null
	) {
		super(new LocalDOConnection(namespaceId, objectId, objectName));
	}

	/**
	 * Retrieves the database schemas, filtering out internal Durable Object
	 * metadata tables (e.g. `_cf_METADATA`) that should not be exposed to users.
	 *
	 * @returns The filtered schema map.
	 */
	override async schemas(): Promise<StudioSchemas> {
		const result = await super.schemas();

		// Filter out internal DO tables
		const excludeList = new Set(["_cf_METADATA"]);

		return Object.fromEntries(
			Object.entries(result).map(([schemaName, schemaItems]) => [
				schemaName,
				schemaItems.filter((item) => !excludeList.has(item.name)),
			])
		);
	}
}
