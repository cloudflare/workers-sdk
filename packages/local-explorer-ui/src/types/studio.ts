import type { Icon } from "@phosphor-icons/react";

export interface StudioSQLToken {
	type:
		| "PLACEHOLDER"
		| "WHITESPACE"
		| "IDENTIFIER"
		| "STRING"
		| "NUMBER"
		| "COMMENT"
		| "OPERATOR"
		| "PUNCTUATION"
		| "UNKNOWN"
		| "SQL";
	value: string;
}

export type StudioDialect = "sqlite" | "mysql" | "postgres" | "wae";

interface StudioTableSchemaStats {
	sizeInByte?: number;
	estimateRowCount?: number;
}

export type StudioSortDirection = "ASC" | "DESC";

export interface StudioTableFTSv5Options {
	content?: string;
	contentRowId?: string;
}

export type StudioColumnConflict =
	| "ROLLBACK"
	| "ABORT"
	| "FAIL"
	| "IGNORE"
	| "REPLACE";

export type StudioForeignKeyAction =
	| "SET_NULL"
	| "SET_DEFAULT"
	| "CASCADE"
	| "RESTRICT"
	| "NO_ACTION";

export interface StoduiForeignKeyClause {
	foreignSchemaName?: string;
	foreignTableName?: string;
	foreignColumns?: string[];
	columns?: string[];
	onUpdate?: StudioForeignKeyAction;
	onDelete?: StudioForeignKeyAction;
}
export interface StudioTableColumnConstraint {
	name?: string;

	primaryKey?: boolean;
	primaryColumns?: string[];
	primaryKeyOrder?: StudioSortDirection;
	primaryKeyConflict?: StudioColumnConflict;
	autoIncrement?: boolean;

	notNull?: boolean;
	notNullConflict?: StudioColumnConflict;

	unique?: boolean;
	uniqueColumns?: string[];
	uniqueConflict?: StudioColumnConflict;

	checkExpression?: string;

	defaultValue?: unknown;
	defaultExpression?: string;

	collate?: string;

	generatedExpression?: string;
	generatedType?: "STORED" | "VIRTUAL";

	foreignKey?: StoduiForeignKeyClause;
}

export interface StudioTableColumn {
	name: string;
	type: string;
	pk?: boolean;
	constraint?: StudioTableColumnConstraint;
}

export interface StudioTableIndex {
	type: "KEY" | "UNIQUE";
	name: string;
	tableName: string;
	columns: string[];
}
export interface StudioTableSchema {
	columns: StudioTableColumn[];
	pk: string[];
	autoIncrement: boolean;
	schemaName: string;
	tableName?: string;
	constraints?: StudioTableColumnConstraint[];
	createScript?: string;
	fts5?: StudioTableFTSv5Options;
	type?: "table" | "view";
	withoutRowId?: boolean;
	strict?: boolean;
	stats?: StudioTableSchemaStats;
	indexes?: StudioTableIndex[];
}

/*
 * Type for table schema change. This is used for create table
 * or edit table
 */
export interface StudioTableColumnChange {
	key: string;
	old: StudioTableColumn | null;
	new: StudioTableColumn | null;
}

export interface StudioTableConstraintChange {
	key: string;
	old: StudioTableColumnConstraint | null;
	new: StudioTableColumnConstraint | null;
}
export interface StudioTableSchemaChange {
	schemaName?: string;
	name: { new: string | null; old: string | null };
	columns: StudioTableColumnChange[];
	constraints: StudioTableConstraintChange[];
	indexes: StudioTableIndex[];
}

/**
 * Maps schema names (e.g., "main", "temp", or custom database schemas)
 * to an array of schema items (tables, views, triggers, etc.).
 */
export type StudioSchemas = Record<string, StudioSchemaItem[]>;

export interface StudioSchemaItem {
	type: "table" | "trigger" | "view" | "schema" | "saved-query";
	name: string;
	schemaName: string;
	tableName?: string;
	tableSchema?: StudioTableSchema;
	query?: string;
}

export type StudioResultValue<T = unknown> = T | undefined | null;
export type StudioResultRow = Record<string, unknown>;

export interface StudioResultStat {
	rowsAffected: number;
	rowsRead: number | null;
	rowsWritten: number | null;

	// Time taken to execute the SQL query on the server (excluding network latency), in milliseconds
	queryDurationMs: number | null;

	// Total duration of the API request, including network latency and server processing, in milliseconds
	requestDurationMs?: number | null;
}

export interface StudioResultHeader {
	name: string;
	displayName: string;
	columnType?: string;
	primaryKey?: boolean;
}

export interface StudioResultSet {
	rows: StudioResultRow[];
	headers: StudioResultHeader[];
	stat: StudioResultStat;
	lastInsertRowid?: number;
}

// Represents a request to modify table rows (insert, update, or delete).
export type StudioTableRowMutationRequest =
	| {
			operation: "INSERT";
			values: Record<string, StudioResultValue>;
			autoIncrementPkColumn?: string;
			pk?: string[];
	  }
	| {
			operation: "UPDATE";
			values: Record<string, StudioResultValue>;
			where: Record<string, StudioResultValue>;
	  }
	| {
			operation: "DELETE";
			where: Record<string, StudioResultValue>;
	  };

// Represents the result of a successful table row mutation.
export interface StudioTableRowMutationResponse {
	lastId?: number;
	record?: Record<string, StudioResultValue>;
}

export interface IStudioConnection {
	query(stmt: string): Promise<StudioResultSet>;
	transaction(statements: string[]): Promise<StudioResultSet[]>;
	batch?(statements: string[]): Promise<StudioResultSet[]>; // Optimize for connection that support batch
}

// Column type hint; null if the type can't be determined
export type StudioColumnTypeHint = "TEXT" | "NUMBER" | "BLOB" | null;

export interface StudioSelectFromTableOptions {
	whereRaw?: string;
	orderByColumn?: string;
	orderByDirection?: StudioSortDirection;
	limit: number;
	offset: number;
}

export abstract class IStudioDriver {
	isSupportReturningValue = false;
	isSupportRowid = false;
	isSupportDropTable = true;
	isSupportEditTable = true;
	isSupportExplain = false;
	dialect: StudioDialect = "sqlite";

	/**
	 * Execute a single SQL statement
	 *
	 * @param statement SQL statement
	 */
	abstract query(statement: string): Promise<StudioResultSet>;

	/**
	 * Executes all SQL statements within a transaction. If any statement fails,
	 * the entire transaction is rolled back.
	 *
	 * @param statements Array of SQL statement
	 */
	abstract transaction(statements: string[]): Promise<StudioResultSet[]>;

	/**
	 * Executes multiple SQL statements in a batch. Execution may or may not be wrapped
	 * in a transaction, depending on the driver implementation.
	 *
	 * @param statements Array of SQL statement
	 */
	abstract batch(statements: string[]): Promise<StudioResultSet[]>;

	/**
	 * Escapes an SQL identifier (e.g., table or column name) to prevent syntax errors or injection.
	 *
	 * @param id The identifier to escape
	 * @returns The escaped identifier
	 */
	abstract escapeId(id: string): string;

	/**
	 * Escapes a literal value for safe inclusion in an SQL statement.
	 * This includes strings, numbers, null, etc.
	 *
	 * @param value The value to escape
	 * @returns The SQL-safe string representation of the value
	 */
	abstract escapeValue(value: unknown): string;

	abstract schemas(): Promise<StudioSchemas>;

	abstract tableSchema(
		schemaName: string,
		tableName: string
	): Promise<StudioTableSchema>;

	abstract selectTable(
		schemaName: string,
		tableName: string,
		options: StudioSelectFromTableOptions
	): Promise<{
		result: StudioResultSet;
		schema: StudioTableSchema;
	}>;

	abstract generateTableSchemaStatement(
		change: StudioTableSchemaChange
	): string[];

	abstract dropTable(schemaName: string, tableName: string): Promise<void>;

	abstract findFirst(
		schemaName: string,
		tableName: string,
		key: Record<string, StudioResultValue>
	): Promise<StudioResultSet>;

	abstract getColumnTypeHint(
		columnTypeName?: string | null
	): StudioColumnTypeHint;

	/**
	 * Builds a list of SQL statements to perform a series of insert, update, or delete operations.
	 *
	 * If `validateSchema` is provided, each mutation is validated against the table schema,
	 * and an error is thrown if any mutation is deemed unsafe.
	 *
	 * @param schemaName - The schema name containing the target table.
	 * @param tableName - The name of the table to mutate.
	 * @param mutations - A list of mutation requests to be converted into SQL statements.
	 * @param validateSchema - Optional schema used for validation before SQL generation.
	 * @returns An array of SQL statements ready for execution.
	 */
	abstract createMutationStatements(
		schemaName: string,
		tableName: string,
		mutations: StudioTableRowMutationRequest[],
		validateSchema?: StudioTableSchema
	): string[];

	/**
	 * Mutates table data by applying a series of insert, update, or delete operations.
	 *
	 * If `validateSchema` is provided, the schema is used to validate the operations
	 * and throw an error if any operation is deemed unsafe.
	 */
	abstract mutateTableRows(
		schemaName: string,
		tableName: string,
		mutations: StudioTableRowMutationRequest[],
		validateSchema?: StudioTableSchema
	): Promise<StudioTableRowMutationResponse[]>;

	/**
	 * Generate the SQL statement for an execution plan.
	 * Typically by prefixing the given statement with EXPLAIN (or the dialect’s equivalent).
	 */
	abstract buildExplainStatement(statement: string): string;

	/**
	 * Inspect the SQL statement and its execution result to decide
	 * whether the driver should override the default result tab UI.
	 *
	 * Useful when the result set is better represented with a custom
	 * visualization (e.g., query plan tree, execution graph).
	 */
	abstract getQueryTabOverride(
		statement: string,
		result: StudioResultSet
	): { label: string; icon: Icon; component: JSX.Element } | null;
}

export type StudioSavedQuery = {
	data: {
		query: string;
	};
	id: string;
	name: string;
	type: "SQL";
	createdAt: string;
	updatedAt: string;
};

export type StudioResource = {
	databaseId?: string;
	type: "d1";
};
