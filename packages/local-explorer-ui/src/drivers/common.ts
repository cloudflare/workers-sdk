import { IStudioDriver } from "../types/studio";
import { escapeSqlValue } from "../utils/studio";
import type {
	IStudioConnection,
	StudioColumnTypeHint,
	StudioResultSet,
	StudioResultValue,
	StudioTableRowMutationRequest,
	StudioTableRowMutationResponse,
	StudioTableSchema,
	StudioTableSchemaChange,
} from "../types/studio";
import type { Icon } from "@phosphor-icons/react";

/**
 * Common SQL driver implementation for databases that use SQL with slight dialect differences.
 * This class provides shared logic across SQL-based database drivers.
 */
export abstract class StudioDriverCommon extends IStudioDriver {
	/**
	 * @param conn - The database connection used for executing queries.
	 */
	constructor(protected readonly conn: IStudioConnection) {
		super();
	}

	/**
	 * Escapes a literal value for safe inclusion in a SQL statement.
	 * Delegates to the shared {@link escapeSqlValue} utility.
	 *
	 * @param value - The value to escape.
	 *
	 * @returns A SQL-safe string representation of the value.
	 */
	escapeValue(value: unknown): string {
		return escapeSqlValue(value);
	}

	/**
	 * Returns a type hint for a given column type name.
	 * The base implementation always returns `null`; subclasses may override
	 * to provide driver-specific type inference.
	 */
	getColumnTypeHint(): StudioColumnTypeHint {
		return null;
	}

	/**
	 * Executes a single SQL statement against the underlying connection.
	 *
	 * @param statement - The SQL statement to execute.
	 *
	 * @returns The result set produced by the statement.
	 */
	async query(statement: string): Promise<StudioResultSet> {
		return this.conn.query(statement);
	}

	/**
	 * Executes an array of SQL statements within a single transaction.
	 * If any statement fails the entire transaction is rolled back.
	 *
	 * @param statements - The SQL statements to execute.
	 *
	 * @returns An array of result sets, one per statement.
	 */
	async transaction(statements: string[]): Promise<StudioResultSet[]> {
		return this.conn.transaction(statements);
	}

	/**
	 * Executes an array of SQL statements in a batch. If the underlying
	 * connection does not support batching, each statement is executed
	 * individually as a fallback.
	 *
	 * @param statements - The SQL statements to execute.
	 *
	 * @returns An array of result sets, one per statement.
	 */
	async batch(statements: string[]): Promise<StudioResultSet[]> {
		// If the connection does not support batch, run each statement individually
		if (this.conn.batch) {
			return this.conn.batch(statements);
		}

		const results: StudioResultSet[] = [];
		for (const stmt of statements) {
			const result = await this.query(stmt);
			results.push(result);
		}

		return results;
	}

	/**
	 * Drops a table from the database.
	 *
	 * @param schemaName - The schema containing the table.
	 * @param tableName - The name of the table to drop.
	 */
	async dropTable(schemaName: string, tableName: string): Promise<void> {
		await this.query(
			`DROP TABLE ${this.escapeId(schemaName)}.${this.escapeId(tableName)}`
		);
	}

	/**
	 * Generates SQL statements to apply a table schema change.
	 * The base implementation throws; subclasses must override.
	 *
	 * @param _ - The schema change descriptor (unused in base).
	 *
	 * @throws Always throws "Not yet implemented".
	 */
	generateTableSchemaStatement(_: StudioTableSchemaChange): string[] {
		throw new Error("Not yet implemented");
	}

	/**
	 * Finds and returns the first row in a table that matches every
	 * column/value pair in {@link key}.
	 *
	 * @param schemaName - The schema containing the table.
	 * @param tableName - The table to query.
	 * @param key - A map of column names to expected values used to build the WHERE clause.
	 *
	 * @returns A result set containing at most one row.
	 */
	async findFirst(
		schemaName: string,
		tableName: string,
		key: Record<string, StudioResultValue>
	): Promise<StudioResultSet> {
		const wherePart = Object.entries(key)
			.map(([colName, colValue]) => {
				return `${this.escapeId(colName)} = ${this.escapeValue(colValue)}`;
			})
			.join(" AND ");

		const sql = `SELECT * FROM ${this.escapeId(schemaName)}.${this.escapeId(
			tableName
		)} ${wherePart ? "WHERE " + wherePart : ""} LIMIT 1 OFFSET 0`;
		return this.query(sql);
	}

	/**
	 * Builds an array of SQL statements (INSERT, UPDATE, or DELETE) from
	 * the provided mutation requests. Optionally validates each mutation
	 * against a table schema before generating SQL.
	 *
	 * @param schemaName - The schema containing the target table.
	 * @param tableName - The name of the table to mutate.
	 * @param mutations - The mutation requests to convert into SQL.
	 * @param validateSchema - Optional table schema used for safety validation.
	 *
	 * @returns An array of SQL statements ready for execution.
	 */
	createMutationStatements(
		schemaName: string,
		tableName: string,
		mutations: StudioTableRowMutationRequest[],
		validateSchema?: StudioTableSchema | undefined
	): string[] {
		// Validate if the operation is safe to perform
		if (validateSchema) {
			mutations.forEach((mutation) =>
				assertValidRowMutation(mutation, validateSchema)
			);
		}

		// Append rowid only if the database supports it
		// and the table is not declared WITHOUT ROWID
		const useRowid = this.isSupportRowid && !validateSchema?.withoutRowId;

		return mutations.map((op) => {
			if (op.operation === "INSERT") {
				return buildInsertStatement(
					this,
					schemaName,
					tableName,
					op.values,
					this.isSupportReturningValue,
					useRowid
				);
			}

			if (op.operation === "DELETE") {
				return buildDeleteStatement(this, schemaName, tableName, op.where);
			}

			return buildUpdateStatement(
				this,
				schemaName,
				tableName,
				op.values,
				op.where,
				this.isSupportReturningValue,
				useRowid
			);
		});
	}

	/**
	 * Applies a series of row mutations (INSERT, UPDATE, DELETE) to a table
	 * within a single transaction. After execution, each mutation response
	 * includes the resulting row data when available.
	 *
	 * @param schemaName - The schema containing the target table.
	 * @param tableName - The table to mutate.
	 * @param mutations - The mutation requests to apply.
	 * @param validateSchema - Optional table schema used for safety validation.
	 *
	 * @returns An array of mutation responses, one per input mutation.
	 */
	async mutateTableRows(
		schemaName: string,
		tableName: string,
		mutations: StudioTableRowMutationRequest[],
		validateSchema?: StudioTableSchema
	): Promise<StudioTableRowMutationResponse[]> {
		const sqls = this.createMutationStatements(
			schemaName,
			tableName,
			mutations,
			validateSchema
		);

		const results = await this.transaction(sqls);

		const responses: StudioTableRowMutationResponse[] = [];

		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			const mutation = mutations[i];

			if (!result || !mutation) {
				responses.push({});
				continue;
			}

			const { operation } = mutation;

			if (operation === "UPDATE") {
				if (result.rows.length === 1) {
					responses.push({ record: result.rows[0] });
				} else {
					const selectResult = await this.findFirst(
						schemaName,
						tableName,
						mutation.where
					);
					responses.push({
						lastId: result.lastInsertRowid,
						record: selectResult.rows[0],
					});
				}
				continue;
			}

			if (operation === "INSERT") {
				if (result.rows.length === 1) {
					responses.push({ record: result.rows[0] });
				} else if (mutation.autoIncrementPkColumn) {
					const selectResult = await this.findFirst(schemaName, tableName, {
						[mutation.autoIncrementPkColumn]: result.lastInsertRowid,
					});
					responses.push({
						lastId: result.lastInsertRowid,
						record: selectResult.rows[0],
					});
				} else if (mutation.pk?.length) {
					const where = mutation.pk.reduce<Record<string, unknown>>(
						(acc, key) => {
							acc[key] = mutation.values[key];
							return acc;
						},
						{}
					);
					const selectResult = await this.findFirst(
						schemaName,
						tableName,
						where
					);
					responses.push({
						lastId: result.lastInsertRowid,
						record: selectResult.rows[0],
					});
				} else {
					responses.push({});
				}
				continue;
			}

			// For DELETE or unknown cases
			responses.push({});
		}

		return responses;
	}

	/**
	 * Builds an EXPLAIN statement for the given SQL query.
	 * The base implementation throws; subclasses must override.
	 *
	 * @param _ - The SQL query to explain (unused in base).
	 *
	 * @throws Always throws "Not implemented".
	 */
	buildExplainStatement(_: string): string {
		throw new Error("Not implemented");
	}

	/**
	 * Returns a custom tab override for rendering query results in the UI.
	 * The base implementation returns `null`, meaning no custom tab is used.
	 * Subclasses may override to provide specialised result visualisations
	 * (e.g. an EXPLAIN QUERY PLAN viewer).
	 *
	 * @param _ - The executed SQL statement.
	 * @param __ - The result set from the query.
	 *
	 * @returns A tab descriptor with label, icon, and component, or `null`.
	 */
	getQueryTabOverride(
		_: string,
		__: StudioResultSet
	): { label: string; icon: Icon; component: JSX.Element } | null {
		return null;
	}
}

/**
 * Validates that a row mutation is safe to perform against the given table
 * schema. Throws descriptive errors when the mutation would violate primary
 * key constraints (e.g. NULL in a PK column, missing PK, or inserting NULL
 * into an auto-increment column).
 *
 * @param op - The mutation request to validate.
 * @param schema - The table schema to validate against.
 *
 * @throws If the mutation is deemed unsafe.
 */
function assertValidRowMutation(
	op: StudioTableRowMutationRequest,
	schema: StudioTableSchema
): void {
	const { operation } = op;
	const { pk: primaryKey, autoIncrement } = schema;
	const originalValues = operation !== "INSERT" ? op.where : {};
	const changeValues = operation !== "DELETE" ? op.values : {};

	const hasNullPrimaryKey = primaryKey.some(
		(key) => originalValues[key] == null
	);

	const hasNullPrimaryKeyAfterUpdate = primaryKey.some((key) => {
		const value = key in changeValues ? changeValues[key] : originalValues[key];
		return value == null;
	});

	if (primaryKey.length === 0) {
		throw new Error(
			"This table has no primary key. Unsafe to perform insert, update, or delete operations."
		);
	}

	switch (operation) {
		case "DELETE":
			if (hasNullPrimaryKey) {
				throw new Error(
					"Cannot delete a row with NULL in primary key columns."
				);
			}
			break;

		case "UPDATE":
			if (hasNullPrimaryKey) {
				throw new Error(
					"Cannot update a row with NULL in primary key columns."
				);
			}
			if (hasNullPrimaryKeyAfterUpdate) {
				throw new Error(
					"Cannot update a row causing NULL in primary key columns."
				);
			}
			break;

		case "INSERT": {
			const firstPrimaryKey = primaryKey[0];
			if (
				autoIncrement &&
				firstPrimaryKey &&
				changeValues[firstPrimaryKey] === null
			) {
				throw new Error(
					"Cannot insert a row with NULL in the auto-increment primary key column."
				);
			}
			if (!autoIncrement && hasNullPrimaryKeyAfterUpdate) {
				throw new Error(
					"Cannot insert a row with NULL in primary key columns."
				);
			}
			break;
		}
	}
}

/**
 * Builds a SQL WHERE clause from a map of column names to values.
 * Each entry becomes an `column = value` equality condition joined with AND.
 *
 * @param dialect - The driver used for identifier and value escaping.
 * @param where - A map of column names to their expected values.
 *
 * @returns The WHERE clause string (including the `WHERE` keyword), or `null` if empty.
 */
function buildWhereClause(
	dialect: IStudioDriver,
	where: Record<string, unknown>
): string | null {
	const conditions = Object.entries(where)
		.map(([columnName, value]) => {
			if (value === null || value === undefined) {
				return `${dialect.escapeId(columnName)} IS NULL`;
			}

			return `${dialect.escapeId(columnName)} = ${dialect.escapeValue(value)}`;
		})
		.join(" AND ");

	if (conditions.length > 0) {
		return "WHERE " + conditions;
	}
	return null;
}

/**
 * Builds the SET clause for a SQL UPDATE statement from a map of
 * column names to their new values.
 *
 * @param dialect - The driver used for identifier and value escaping.
 * @param values - A map of column names to their new values.
 *
 * @returns The comma-separated SET assignments string.
 */
function buildSetClause(
	dialect: IStudioDriver,
	values: Record<string, unknown>
): string {
	return Object.entries(values)
		.map(([columnName, value]) => {
			return `${dialect.escapeId(columnName)} = ${dialect.escapeValue(value)}`;
		})
		.join(", ");
}

/**
 * Builds the column list and VALUES clause for a SQL INSERT statement.
 *
 * @param dialect - The driver used for identifier and value escaping.
 * @param values - A map of column names to the values to insert.
 *
 * @returns A string in the form `(col1, col2) VALUES(val1, val2)`.
 */
function buildInsertValuesClause(
	dialect: IStudioDriver,
	values: Record<string, unknown>
): string {
	const columnNameList: string[] = [];
	const valueList: string[] = [];

	for (const [columnName, value] of Object.entries(values)) {
		columnNameList.push(dialect.escapeId(columnName));
		valueList.push(dialect.escapeValue(value));
	}

	return `(${columnNameList.join(", ")}) VALUES(${valueList.join(", ")})`;
}

/**
 * Builds a complete SQL INSERT statement, optionally appending a
 * RETURNING clause when supported by the dialect.
 *
 * @param dialect - The driver used for escaping.
 * @param schema - The schema name containing the target table.
 * @param table - The target table name.
 * @param value - A map of column names to the values to insert.
 * @param supportReturning - Whether the dialect supports `RETURNING`.
 * @param supportRowId - Whether to include `rowid` in the RETURNING clause.
 *
 * @returns The complete INSERT SQL string.
 */
function buildInsertStatement(
	dialect: IStudioDriver,
	schema: string,
	table: string,
	value: Record<string, unknown>,
	supportReturning: boolean,
	supportRowId: boolean
): string {
	return [
		"INSERT INTO",
		`${dialect.escapeId(schema)}.${dialect.escapeId(table)}`,
		buildInsertValuesClause(dialect, value),
		supportReturning ? `RETURNING ${supportRowId ? "rowid, " : ""}*` : "",
	].join(" ");
}

/**
 * Builds a complete SQL UPDATE statement with a WHERE clause,
 * optionally appending a RETURNING clause when supported.
 *
 * @param dialect - The driver used for escaping.
 * @param schema - The schema name containing the target table.
 * @param table - The target table name.
 * @param value - A map of column names to their new values (SET clause).
 * @param where - A map of column names to values for the WHERE clause.
 * @param supportReturning - Whether the dialect supports `RETURNING`.
 * @param supportRowId - Whether to include `rowid` in the RETURNING clause.
 *
 * @returns The complete UPDATE SQL string.
 */
function buildUpdateStatement(
	dialect: IStudioDriver,
	schema: string,
	table: string,
	value: Record<string, unknown>,
	where: Record<string, unknown>,
	supportReturning: boolean,
	supportRowId: boolean
): string {
	return [
		"UPDATE",
		`${dialect.escapeId(schema)}.${dialect.escapeId(table)}`,
		"SET",
		buildSetClause(dialect, value),
		buildWhereClause(dialect, where),
		supportReturning ? `RETURNING ${supportRowId ? "rowid, " : ""}*` : "",
	]
		.filter(Boolean)
		.join(" ");
}

/**
 * Builds a complete SQL DELETE statement with a WHERE clause.
 *
 * @param dialect - The driver used for escaping.
 * @param schema - The schema name containing the target table.
 * @param table - The target table name.
 * @param where - A map of column names to values for the WHERE clause.
 *
 * @returns The complete DELETE SQL string.
 */
function buildDeleteStatement(
	dialect: IStudioDriver,
	schema: string,
	table: string,
	where: Record<string, unknown>
): string {
	return [
		"DELETE FROM",
		`${dialect.escapeId(schema)}.${dialect.escapeId(table)}`,
		buildWhereClause(dialect, where),
	]
		.filter(Boolean)
		.join(" ");
}
