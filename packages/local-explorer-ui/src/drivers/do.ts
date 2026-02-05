import * as http from "@cloudflare/util-http";
import { transformStudioArrayBasedResult } from "../utils/studio";
import { doEndpoints as endpoints } from "../utils/studio/stubs/routes";
import { StudioSQLiteDriver } from "./sqlite";
import type {
	IStudioConnection,
	StudioResultSet,
	StudioSchemas,
} from "../types/studio";

export class StudioDODriver extends StudioSQLiteDriver {
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

export class StudioDOConnection implements IStudioConnection {
	constructor(
		private readonly accountId: string,
		private readonly namespaceId: string,
		private readonly objectId?: string | null,
		private readonly name?: string | null,
		private readonly jurisdiction?: string | null
	) {}

	async query(statement: string): Promise<StudioResultSet> {
		const result = await this.transaction([statement]);
		return result[0];
	}

	async transaction(statements: string[]): Promise<StudioResultSet[]> {
		const trimmedStatements = statements.map((s) =>
			s.trim().replace(/;+$/, "")
		);

		let body: DORawQueryResponse | undefined;

		try {
			let bodyContents: any = {};

			if (this.objectId) {
				bodyContents = {
					queries: trimmedStatements.map((sql) => ({ sql })),
					durable_object_id: this.objectId,
				};
			} else if (this.name) {
				bodyContents = {
					queries: trimmedStatements.map((sql) => ({ sql })),
					durable_object_name: this.name,
					jurisdiction: this.jurisdiction,
				};
			}

			const response = await http.post(
				endpoints.rawNameQuery.toUrl({
					accountId: this.accountId,
					namespaceId: this.namespaceId,
				}),
				{
					body: JSON.stringify(bodyContents),
					headers: {
						"Content-Type": "application/json",
					},
					hideErrorAlert: true,
				}
			);

			body = response.body as DORawQueryResponse;
		} catch (e) {
			body = e?.body;
		}

		if (!body) {
			throw new Error("Unknown error during request.");
		}

		if (body?.errors && Array.isArray(body.errors) && body.errors.length > 0) {
			throw new Error(body.errors[0].message);
		}

		if (body?.result?.error) {
			throw new Error(body.result.error);
		}

		if (!body?.result?.results || !Array.isArray(body.result.results)) {
			throw new Error(
				"Invalid response format: missing or invalid result data."
			);
		}

		return body.result.results.map((result) => ({
			...transformStudioArrayBasedResult({
				rows: result.rows,
				headers: result.columns,
				transformHeader: (headerName) => {
					return {
						name: headerName,
						displayName: headerName,
					};
				},
			}),
			stat: {
				rowsAffected: 0,
				rowsRead: result.meta.rows_read,
				rowsWritten: result.meta.rows_written,
				queryDurationMs: 0,
			},
		}));
	}
}

interface DORawQueryResponse {
	errors: { code: number; message: string }[];
	result: {
		error?: string;
		results: DORawQueryResult[];
	};
}

interface DORawQueryResult {
	columns: string[];
	rows: unknown[][];
	meta: {
		rows_read: number;
		rows_written: number;
	};
}
