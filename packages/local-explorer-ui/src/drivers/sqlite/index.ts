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

/**
 * Represents a row from SQLite's `sqlite_master` system table.
 * Each row describes a schema object (table, view, trigger, or index).
 */
type SQLiteMasterRow = {
	name: string;
	sql: string;
	tbl_name: string;
	type: string;
};

/**
 * SQLite-specific driver implementation. Extends {@link StudioDriverCommon}
 * with SQLite dialect behaviour including identifier escaping, type hinting,
 * schema introspection via `sqlite_master`, and EXPLAIN QUERY PLAN support.
 */
export class StudioSQLiteDriver extends StudioDriverCommon {
	override isSupportEditTable = true;
	override isSupportExplain = true;
	override isSupportReturningValue = true;
	override isSupportRowid = true;

	/**
	 * Escapes a SQL identifier using double-quotes, doubling any existing
	 * double-quote characters within the identifier.
	 *
	 * @param id - The identifier to escape.
	 *
	 * @returns The escaped identifier wrapped in double-quotes.
	 */
	escapeId(id: string): string {
		return `"${id.replace(/"/g, `""`)}"`;
	}

	/**
	 * Maps a SQLite column type name to a broad type hint category
	 * (`TEXT`, `NUMBER`, or `BLOB`). Returns `null` when the type
	 * cannot be determined.
	 *
	 * @param type - The column type name (e.g. `VARCHAR`, `INTEGER`, `BLOB`).
	 *
	 * @returns The type hint, or `null` if the type is not provided.
	 */
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

	/**
	 * Retrieves all database schemas by querying `sqlite_master`.
	 * Parses CREATE TABLE scripts to extract column definitions and
	 * constraints, and filters out internal FTS5 helper tables.
	 *
	 * @returns A map of schema names to their schema items (tables, views, triggers).
	 */
	async schemas(): Promise<StudioSchemas> {
		const defaultSchemaName = "main";
		const result = await this.query(`SELECT * FROM sqlite_master;`);

		let schemaItems = new Array<StudioSchemaItem>();
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

	/**
	 * Retrieves the full schema definition for a specific table or view,
	 * including column definitions, constraints, and indexes. Falls back
	 * to `pragma_table_info` for views or when the CREATE TABLE script
	 * cannot be parsed.
	 *
	 * @param schemaName - The schema containing the table.
	 * @param tableName - The name of the table or view.
	 *
	 * @returns The parsed table schema.
	 *
	 * @throws If the table cannot be found or its CREATE TABLE script fails to parse.
	 */
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
				indexes: indexList,
				schemaName,
				type: "table",
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

	/**
	 * Retrieves a simplified table schema using `pragma_table_info` as a
	 * fallback when the CREATE TABLE script cannot be parsed (e.g. for
	 * views or virtual tables).
	 *
	 * @param schemaName - The schema containing the table.
	 * @param tableName - The name of the table or view.
	 *
	 * @returns A basic table schema with column names, types, and primary keys.
	 */
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
			pk: number;
			type: string;
		}>;

		const columns: StudioTableColumn[] = rows.map((row) => ({
			name: row.name,
			pk: !!row.pk,
			type: row.type,
		}));

		return {
			autoIncrement: false,
			columns,
			pk: columns.filter((col) => col.pk).map((col) => col.name),
			schemaName,
			tableName,
		};
	}

	/**
	 * Queries rows from a table with pagination, sorting, and optional
	 * filtering. Automatically injects a `rowid` column for tables that
	 * lack an explicit primary key, and includes a `rank` column for
	 * FTS5 virtual tables.
	 *
	 * @param schemaName - The schema containing the table.
	 * @param tableName - The table to query.
	 * @param options - Pagination, sorting, and filter options.
	 *
	 * @returns The query result set and the resolved table schema.
	 */
	async selectTable(
		schemaName: string,
		tableName: string,
		options: StudioSelectFromTableOptions
	): Promise<{
		result: StudioResultSet;
		schema: StudioTableSchema;
	}> {
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
					constraint: {
						primaryKey: true,
						autoIncrement: true,
					},
					name: "rowid",
					type: "INTEGER",
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
					columns: [
						{
							name: "rank",
							type: "INTEGER",
						},
						...schema.columns,
					],
				},
			};
		}

		return {
			result,
			schema,
		};
	}

	/**
	 * Generates SQL ALTER or CREATE TABLE statements from a schema diff.
	 *
	 * @param change - The schema change descriptor.
	 *
	 * @returns An array of SQL statements to apply the change.
	 */
	override generateTableSchemaStatement(
		change: StudioTableSchemaChange
	): string[] {
		return buildSQLiteSchemaDiffStatement(this, change);
	}

	/**
	 * Builds an `EXPLAIN QUERY PLAN` statement from the given SQL.
	 * Parameter placeholders (`?`) are replaced with empty strings so
	 * SQLite can plan without bindings. Any existing `EXPLAIN` or
	 * `EXPLAIN ANALYZE` prefix is upgraded to `EXPLAIN QUERY PLAN`.
	 *
	 * @param sql - The SQL query to explain.
	 *
	 * @returns The EXPLAIN QUERY PLAN SQL string.
	 *
	 * @throws If the resulting statement does not start with `EXPLAIN QUERY PLAN`.
	 */
	override buildExplainStatement(sql: string): string {
		// Replaces parameter placeholders with benign literals so SQLite can plan
		// without bindings (no need to provide real values).
		const sanitizedTokens = tokenizeSQL(sql.trim(), "sqlite")
			.filter((t) => t.type !== "COMMENT")
			.map(
				(t): StudioSQLToken =>
					t.value === "?"
						? {
								type: "STRING",
								value: `''`,
							}
						: t
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

	/**
	 * Returns a custom "Explain" tab for EXPLAIN QUERY PLAN results,
	 * rendering the query plan in a dedicated UI component. Returns
	 * `null` for all other statement types.
	 *
	 * @param statement - The executed SQL statement.
	 * @param result - The result set from the query.
	 *
	 * @returns A tab descriptor for EQP results, or `null`.
	 */
	override getQueryTabOverride(
		statement: string,
		result: StudioResultSet
	): {
		component: JSX.Element;
		icon: Icon;
		label: string;
	} | null {
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
