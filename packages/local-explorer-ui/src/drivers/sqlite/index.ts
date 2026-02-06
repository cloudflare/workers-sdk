import { StethoscopeIcon } from "@phosphor-icons/react";
import { StudioSQLiteExplainTab } from "../../components/studio/Explain/SQLiteExplainTab";
import { tokenizeSQL } from "../../utils/studio";
import { StudioDriverCommon } from "../common";
import { buildSQLiteSchemaDiffStatement } from "./generate";
import {
	parseSQLiteCreateTableScript,
	parseSQLiteIndexScript,
} from "./parsers";
import type {
	StudioColumnTypeHint,
	StudioResultSet,
	StudioSchemaItem,
	StudioSchemas,
	StudioSelectFromTableOptions,
	StudioSQLToken,
	StudioTableColumn,
	StudioTableIndex,
	StudioTableSchema,
	StudioTableSchemaChange,
} from "../../types/studio";
import type { Icon } from "@phosphor-icons/react";

export class StudioSQLiteDriver extends StudioDriverCommon {
	override isSupportEditTable = true;
	override isSupportExplain = true;
	override isSupportReturningValue = true;
	override isSupportRowid = true;

	escapeId(id: string): string {
		return `"${id.replace(/"/g, `""`)}"`;
	}

	override getColumnTypeHint(type?: string | null): StudioColumnTypeHint {
		if (!type) {
			return null;
		}

		type = type.toUpperCase();

		if (
			type.includes("TEXT") ||
			type.includes("CHAR") ||
			type.includes("CLOB") ||
			type.includes("STRING")
		) {
			return "TEXT";
		}

		if (
			type.includes("INT") ||
			type.includes("NUMBER") ||
			type.includes("REAL") ||
			type.includes("DOUBLE") ||
			type.includes("FLOAT")
		) {
			return "NUMBER";
		}

		if (type.includes("BLOB")) {
			return "BLOB";
		}

		// Default to TEXT for unknown types
		return "TEXT";
	}

	async schemas(): Promise<StudioSchemas> {
		const defaultSchemaName = "main";
		const result = await this.query(`SELECT * FROM sqlite_master;`);

		let schemaItems: StudioSchemaItem[] = [];
		const rows = result.rows as Array<SQLiteMasterRow>;

		for (const row of rows) {
			if (row.type === "table") {
				try {
					schemaItems.push({
						type: "table",
						schemaName: defaultSchemaName,
						name: row.name,
						tableSchema: {
							...parseSQLiteCreateTableScript(defaultSchemaName, row.sql),
							createScript: row.sql,
						},
					});
				} catch {
					console.warn(`Failed to parse schema for table: ${row.name}`);

					schemaItems.push({
						type: "table",
						name: row.name,
						schemaName: defaultSchemaName,
					});
				}
			} else if (row.type === "trigger") {
				schemaItems.push({
					type: "trigger",
					name: row.name,
					tableName: row.tbl_name,
					schemaName: defaultSchemaName,
				});
			} else if (row.type === "view") {
				schemaItems.push({
					type: "view",
					name: row.name,
					schemaName: defaultSchemaName,
				});
			}
		}

		// Remove FTS-related tables from schema. Only keep the main one
		const ftsTableNames = schemaItems
			.filter((item) => item.tableSchema?.fts5)
			.map((item) => item.name);

		const ignoreTableNames = new Set(
			ftsTableNames
				.map((tableName) => {
					return [
						`${tableName}_content`,
						`${tableName}_idx`,
						`${tableName}_docsize`,
						`${tableName}_config`,
						`${tableName}_data`,
					];
				})
				.flat()
		);

		schemaItems = schemaItems.filter(
			(item) => !ignoreTableNames.has(item.name)
		);

		return {
			[defaultSchemaName]: schemaItems,
		};
	}

	async tableSchema(
		schemaName: string,
		tableName: string
	): Promise<StudioTableSchema> {
		const sql = `SELECT * FROM ${this.escapeId(
			schemaName
		)}.sqlite_schema WHERE tbl_name = ${this.escapeValue(
			tableName
		)} AND "type" IN ('table', 'view', 'index');`;

		const result = await this.query(sql);
		const schemaList = result.rows as SQLiteMasterRow[];

		// Handle collecting all indexes
		const indexScriptList = schemaList.filter(
			(schema) => schema.type === "index" && schema.sql !== null
		);

		const indexList: StudioTableIndex[] = [];
		for (const indexScript of indexScriptList) {
			try {
				indexList.push(parseSQLiteIndexScript(indexScript.sql));
			} catch {
				continue;
			}
		}

		// Handle table definition
		const tableScript = schemaList.find(
			(schema) => schema.type === "table" || schema.type === "view"
		);

		if (!tableScript) {
			throw new Error("Unexpected error finding table " + tableName);
		}

		if (tableScript.type === "view") {
			return this.getFallbackTableSchema(schemaName, tableName);
		}

		try {
			const createScript = tableScript.sql;
			const schema = {
				...parseSQLiteCreateTableScript(schemaName, createScript),
				createScript,
				schemaName,
				type: "table",
				indexes: indexList,
			} as StudioTableSchema;

			if (schema.fts5) {
				return {
					...(await this.getFallbackTableSchema(schemaName, tableName)),
					fts5: schema.fts5,
				};
			}

			return schema;
		} catch {
			throw new Error(`Failed to parse CREATE TABLE script for '${tableName}'`);
		}
	}

	protected async getFallbackTableSchema(
		schemaName: string,
		tableName: string
	): Promise<StudioTableSchema> {
		const sql = `SELECT * FROM ${this.escapeId(
			schemaName
		)}.pragma_table_info(${this.escapeValue(tableName)});`;
		const result = await this.query(sql);

		const rows = result.rows as Array<{
			name: string;
			type: string;
			pk: number;
		}>;

		const columns: StudioTableColumn[] = rows.map((row) => ({
			name: row.name,
			type: row.type,
			pk: !!row.pk,
		}));

		return {
			columns,
			schemaName,
			tableName,
			pk: columns.filter((col) => col.pk).map((col) => col.name),
			autoIncrement: false,
		};
	}

	async selectTable(
		schemaName: string,
		tableName: string,
		options: StudioSelectFromTableOptions
	): Promise<{ result: StudioResultSet; schema: StudioTableSchema }> {
		const schema = await this.tableSchema(schemaName, tableName);
		const { limit, offset, orderByColumn, orderByDirection } = options;

		const canInjectRowId =
			!schema.fts5 &&
			schema.pk.length === 0 &&
			!schema.withoutRowId &&
			!schema.columns.find((c) => c.name === "rowid") &&
			schema.type === "table";

		// Fallback to `rowid` as the primary key if none exists,
		// but only if a `rowid` column isn't already defined.
		if (canInjectRowId) {
			schema.columns = [
				{
					name: "rowid",
					type: "INTEGER",
					constraint: {
						primaryKey: true,
						autoIncrement: true,
					},
				},
				...schema.columns,
			];
			schema.pk = ["rowid"];
			schema.autoIncrement = true;
		}

		const escapedTable = `${this.escapeId(schemaName)}.${this.escapeId(
			tableName
		)}`;

		let selectCols = "*";

		if (canInjectRowId) {
			selectCols = "rowid, *";
		} else if (schema.fts5) {
			selectCols = `rank, *`;
		}

		const selectClause = `SELECT ${selectCols} FROM ${escapedTable}`;

		const orderClause =
			orderByColumn &&
			orderByDirection &&
			["ASC", "DESC"].includes(orderByDirection)
				? `ORDER BY ${this.escapeId(orderByColumn)} ${orderByDirection}`
				: "";

		const limitClause = `LIMIT ${this.escapeValue(
			limit
		)} OFFSET ${this.escapeValue(offset)}`;

		const whereClause = options.whereRaw ? `WHERE ${options.whereRaw}` : "";

		const query = [selectClause, whereClause, orderClause, limitClause]
			.filter(Boolean)
			.join(" ");

		const result = await this.conn.query(query);

		// Add rank column to result set for FTS5 tables
		if (schema.fts5) {
			return {
				result,
				schema: {
					...schema,
					columns: [{ name: "rank", type: "INTEGER" }, ...schema.columns],
				},
			};
		}

		return {
			result,
			schema,
		};
	}

	override generateTableSchemaStatement(
		change: StudioTableSchemaChange
	): string[] {
		return buildSQLiteSchemaDiffStatement(this, change);
	}

	override buildExplainStatement(sql: string): string {
		// Replaces parameter placeholders with benign literals so SQLite can plan
		// without bindings (no need to provide real values).
		const sanitizedTokens = tokenizeSQL(sql.trim(), "sqlite")
			.filter((t) => t.type !== "COMMENT")
			.map(
				(t): StudioSQLToken =>
					t.value === "?" ? { type: "STRING", value: `''` } : t
			);

		const normalizedSql = sanitizedTokens.map((t) => t.value).join("");

		// Prepend/upgrade to EXPLAIN QUERY PLAN
		const eqpSql = normalizedSql.replace(
			/^(?!EXPLAIN\s+QUERY\s+PLAN\b)(?:EXPLAIN\b(?:\s+ANALYZE\b)?\s*)?/i,
			"EXPLAIN QUERY PLAN "
		);

		// Belt-and-suspenders guard: ensure we didn’t lose the EQP prefix.
		if (!eqpSql.startsWith("EXPLAIN QUERY PLAN ")) {
			throw new Error("Explain statement must start with EXPLAIN QUERY PLAN");
		}

		return eqpSql;
	}

	override getQueryTabOverride(
		statement: string,
		result: StudioResultSet
	): { label: string; icon: Icon; component: JSX.Element } | null {
		if (!statement.toUpperCase().startsWith("EXPLAIN QUERY PLAN ")) {
			return null;
		}

		return {
			component: StudioSQLiteExplainTab({ data: result }),
			icon: StethoscopeIcon,
			label: "Explain",
		};
	}
}

type SQLiteMasterRow = {
	type: string;
	name: string;
	tbl_name: string;
	sql: string;
};
