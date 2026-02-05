import * as http from "@cloudflare/util-http";
import { transformStudioArrayBasedResult } from "../utils/studio";
import { endpoints } from "../utils/studio/stubs";
import { StudioSQLiteDriver } from "./sqlite";
import type {
	IStudioConnection,
	StudioResultSet,
	StudioSchemas,
} from "../types/studio";

export class StudioD1Driver extends StudioSQLiteDriver {
	async schemas(): Promise<StudioSchemas> {
		const result = await super.schemas();

		const excludeList = new Set(["_cf_KV"]);

		// Remove internal tables
		return Object.fromEntries(
			Object.entries(result).map(([schemaName, schemaItems]) => [
				schemaName,
				schemaItems.filter((item) => !excludeList.has(item.name)),
			])
		);
	}
}

export class StudioD1Connection implements IStudioConnection {
	constructor(
		private readonly accountId: string,
		private readonly databaseId: string
	) {}

	async query(statement: string): Promise<StudioResultSet> {
		const result = await this.transaction([statement]);
		return result[0];
	}

	async transaction(statements: string[]): Promise<StudioResultSet[]> {
		const trimmedStatements = statements.map((s) =>
			s.trim().replace(/;+$/, "")
		);

		let body: D1RawQueryResponse | undefined;

		try {
			const response = await http.post(
				endpoints.raw.toUrl({
					accountId: this.accountId,
					databaseId: this.databaseId,
				}),
				{
					body: JSON.stringify({ sql: trimmedStatements.join(";") }),
					hideErrorAlert: true,
				}
			);

			body = response.body as D1RawQueryResponse;
		} catch (e) {
			body = e?.body;
		}

		if (!body) {
			throw new Error("Unknown error during request.");
		}

		if (body.errors && Array.isArray(body.errors) && body.errors.length > 0) {
			throw new Error(body.errors[0].message);
		}

		if (!body.result || !Array.isArray(body.result)) {
			throw new Error(
				"Invalid response format: missing or invalid result data."
			);
		}

		return body.result.map((result) => ({
			...transformStudioArrayBasedResult({
				rows: result.results.rows,
				headers: result.results.columns,
				transformHeader: (headerName) => {
					return {
						name: headerName,
						displayName: headerName,
					};
				},
			}),
			stat: {
				rowsAffected: result.meta.changes,
				rowsRead: result.meta.rows_read,
				rowsWritten: result.meta.rows_written,
				queryDurationMs: result.meta.duration,
			},
			lastInsertRowid: result.meta.last_row_id,
		}));
	}
}

interface D1RawQueryResponse {
	errors: { code: number; message: string }[];
	result: D1RawQueryResult[];
}

interface D1RawQueryResult {
	results: {
		columns: string[];
		rows: unknown[][];
	};
	meta: {
		duration: number;
		changes: number;
		last_row_id: number;
		rows_read: number;
		rows_written: number;
	};
}
