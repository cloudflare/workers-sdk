import * as http from "@cloudflare/util-http";
import { StudioDriverCommon } from "./common";
import type {
	IStudioConnection,
	StudioColumnTypeHint,
	StudioDialect,
	StudioResultSet,
	StudioSchemas,
	StudioSelectFromTableOptions,
	StudioTableColumn,
	StudioTableSchema,
} from "../types/studio";

// Worker Analytics Engine has fixed columns
const WAEGenericColumns: StudioTableColumn[] = [
	{ name: "_sample_interval", type: "UInt32" },
	{ name: "timestamp", type: "DateTime" },
	{ name: "dataset", type: "String" },
	{ name: "index1", type: "String" },
	{ name: "blob1", type: "String" },
	{ name: "blob2", type: "String" },
	{ name: "blob3", type: "String" },
	{ name: "blob4", type: "String" },
	{ name: "blob5", type: "String" },
	{ name: "blob6", type: "String" },
	{ name: "blob7", type: "String" },
	{ name: "blob8", type: "String" },
	{ name: "blob9", type: "String" },
	{ name: "blob10", type: "String" },
	{ name: "blob11", type: "String" },
	{ name: "blob12", type: "String" },
	{ name: "blob13", type: "String" },
	{ name: "blob14", type: "String" },
	{ name: "blob15", type: "String" },
	{ name: "blob16", type: "String" },
	{ name: "blob17", type: "String" },
	{ name: "blob18", type: "String" },
	{ name: "blob19", type: "String" },
	{ name: "blob20", type: "String" },
	{ name: "double1", type: "Float64" },
	{ name: "double2", type: "Float64" },
	{ name: "double3", type: "Float64" },
	{ name: "double4", type: "Float64" },
	{ name: "double5", type: "Float64" },
	{ name: "double6", type: "Float64" },
	{ name: "double7", type: "Float64" },
	{ name: "double8", type: "Float64" },
	{ name: "double9", type: "Float64" },
	{ name: "double10", type: "Float64" },
	{ name: "double11", type: "Float64" },
	{ name: "double12", type: "Float64" },
	{ name: "double13", type: "Float64" },
	{ name: "double14", type: "Float64" },
	{ name: "double15", type: "Float64" },
	{ name: "double16", type: "Float64" },
	{ name: "double17", type: "Float64" },
	{ name: "double18", type: "Float64" },
	{ name: "double19", type: "Float64" },
	{ name: "double20", type: "Float64" },
];

export class StudioWAEDriver extends StudioDriverCommon {
	dialect: StudioDialect = "wae";
	isSupportDropTable = false;
	isSupportEditTable = false;

	escapeId(id: string): string {
		return `"${id.replace(/"/g, `""`)}"`;
	}

	async schemas(): Promise<StudioSchemas> {
		const tableList = await this.query("SHOW TABLES");
		const tableListRows = tableList.rows as { dataset: string; type: string }[];

		return {
			main: tableListRows.map((r) => ({
				name: r.dataset,
				schemaName: "main",
				type: "table",
				tableName: r.dataset,
				tableSchema: {
					tableName: r.dataset,
					columns: structuredClone(WAEGenericColumns),
					pk: [],
					autoIncrement: false,
					schemaName: "main",
				},
			})),
		};
	}

	getColumnTypeHint(type?: string | null): StudioColumnTypeHint {
		if (type === "UInt32") {
			return "NUMBER";
		}
		if (type === "Float64") {
			return "NUMBER";
		}
		if (type === "DateTime") {
			return "TEXT";
		}
		if (type === "String") {
			return "TEXT";
		}
		return null;
	}

	async tableSchema(
		schemaName: string,
		tableName: string
	): Promise<StudioTableSchema> {
		return {
			columns: structuredClone(WAEGenericColumns),
			tableName,
			pk: [],
			autoIncrement: false,
			schemaName,
		};
	}

	async selectTable(
		schemaName: string,
		tableName: string,
		{
			limit,
			offset,
			orderByColumn,
			orderByDirection,
			whereRaw,
		}: StudioSelectFromTableOptions
	): Promise<{ result: StudioResultSet; schema: StudioTableSchema }> {
		const schema = await this.tableSchema(schemaName, tableName);
		const selectClause = `SELECT * FROM ${this.escapeId(tableName)}`;

		const orderClause =
			orderByColumn &&
			orderByDirection &&
			["ASC", "DESC"].includes(orderByDirection)
				? `ORDER BY ${this.escapeId(orderByColumn)} ${orderByDirection}`
				: 'ORDER BY "timestamp" DESC';

		const limitClause = `LIMIT ${this.escapeValue(
			limit
		)} OFFSET ${this.escapeValue(offset)}`;
		const whereClause = whereRaw ? `WHERE ${whereRaw}` : "";

		const query = [selectClause, whereClause, orderClause, limitClause]
			.filter(Boolean)
			.join(" ");

		const result = await this.query(query);

		result.headers = schema.columns.map((c) => ({
			name: c.name,
			displayName: c.name,
			originalType: c.type,
		}));

		return {
			result,
			schema,
		};
	}
}

export class StudioWAEConnection implements IStudioConnection {
	constructor(private readonly accountId: string) {}

	async query(stmt: string): Promise<StudioResultSet> {
		try {
			const response = await http.post(
				`/accounts/${this.accountId}/analytics_engine/sql`,
				{
					body: stmt,
					hideErrorAlert: true,
					headers: {
						"Content-Type": "text/plain",
					},
				}
			);

			const result = response.body as WAEResponse;

			return {
				rows: result.data,
				headers: result.meta.map((m) => ({
					name: m.name,
					displayName: m.name,
					originalType: m.type,
				})),
				stat: {
					rowsAffected: 0,
					rowsRead: 0,
					rowsWritten: 0,
					queryDurationMs: 0,
					requestDurationMs: 0,
				},
			};
		} catch (e) {
			if (e.body && typeof e.body === "string") {
				throw new Error(e.body);
			} else {
				throw new Error("Unknown error while executing WAE query");
			}
		}
	}

	async transaction(stmt: string[]): Promise<StudioResultSet[]> {
		return Promise.all(stmt.map((s) => this.query(s)));
	}
}

interface WAEResponseMeta {
	name: string;
	type: "UInt32" | "String" | "Float64" | "DateTime";
}

interface WAEResponse {
	meta: WAEResponseMeta[];
	data: Record<string, unknown>[];
}
