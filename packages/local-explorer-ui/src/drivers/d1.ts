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
	constructor(private readonly databaseId: string) {}

	async query(statement: string): Promise<StudioResultSet> {
		const [result] = await this.transaction([statement]);
		if (!result) {
			throw new Error("No result returned from query");
		}

		return result;
	}

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
	constructor(databaseId: string) {
		super(new LocalD1Connection(databaseId));
	}

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
