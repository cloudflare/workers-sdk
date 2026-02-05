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
	constructor(protected readonly conn: IStudioConnection) {
		super();
	}

	escapeValue(value: unknown): string {
		return escapeSqlValue(value);
	}

	getColumnTypeHint(): StudioColumnTypeHint {
		return null;
	}

	async query(statement: string): Promise<StudioResultSet> {
		return this.conn.query(statement);
	}

	async transaction(statements: string[]): Promise<StudioResultSet[]> {
		return this.conn.transaction(statements);
	}

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

	async dropTable(schemaName: string, tableName: string): Promise<void> {
		await this.query(
			`DROP TABLE ${this.escapeId(schemaName)}.${this.escapeId(tableName)}`
		);
	}

	generateTableSchemaStatement(_: StudioTableSchemaChange): string[] {
		throw new Error("Not yet implemented");
	}

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

	buildExplainStatement(_: string): string {
		throw new Error("Not implemented");
	}

	getQueryTabOverride(
		_: string,
		__: StudioResultSet
	): { label: string; icon: Icon; component: JSX.Element } | null {
		return null;
	}
}

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

		case "INSERT":
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

function buildWhereClause(
	dialect: IStudioDriver,
	where: Record<string, unknown>
) {
	const conditions = Object.entries(where)
		.map(([columnName, value]) => {
			return `${dialect.escapeId(columnName)} = ${dialect.escapeValue(value)}`;
		})
		.join(" AND ");

	if (conditions.length > 0) {
		return "WHERE " + conditions;
	}
	return null;
}

function buildSetClause(
	dialect: IStudioDriver,
	values: Record<string, unknown>
) {
	return Object.entries(values)
		.map(([columnName, value]) => {
			return `${dialect.escapeId(columnName)} = ${dialect.escapeValue(value)}`;
		})
		.join(", ");
}

function buildInsertValuesClause(
	dialect: IStudioDriver,
	values: Record<string, unknown>
) {
	const columnNameList: string[] = [];
	const valueList: string[] = [];

	for (const [columnName, value] of Object.entries(values)) {
		columnNameList.push(dialect.escapeId(columnName));
		valueList.push(dialect.escapeValue(value));
	}

	return `(${columnNameList.join(", ")}) VALUES(${valueList.join(", ")})`;
}

function buildInsertStatement(
	dialect: IStudioDriver,
	schema: string,
	table: string,
	value: Record<string, unknown>,
	supportReturning: boolean,
	supportRowId: boolean
) {
	return [
		"INSERT INTO",
		`${dialect.escapeId(schema)}.${dialect.escapeId(table)}`,
		buildInsertValuesClause(dialect, value),
		supportReturning ? `RETURNING ${supportRowId ? "rowid, " : ""}*` : "",
	].join(" ");
}

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
