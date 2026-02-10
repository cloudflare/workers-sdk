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
	estimateRowCount?: number;
	sizeInByte?: number;
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
	columns?: string[];
	foreignColumns?: string[];
	foreignSchemaName?: string;
	foreignTableName?: string;
	onDelete?: StudioForeignKeyAction;
	onUpdate?: StudioForeignKeyAction;
}
export interface StudioTableColumnConstraint {
	autoIncrement?: boolean;
	checkExpression?: string;
	collate?: string;
	defaultExpression?: string;
	defaultValue?: unknown;
	foreignKey?: StoduiForeignKeyClause;
	generatedExpression?: string;
	generatedType?: "STORED" | "VIRTUAL";
	name?: string;
	notNull?: boolean;
	notNullConflict?: StudioColumnConflict;
	primaryColumns?: string[];
	primaryKey?: boolean;
	primaryKeyConflict?: StudioColumnConflict;
	primaryKeyOrder?: StudioSortDirection;
	unique?: boolean;
	uniqueColumns?: string[];
	uniqueConflict?: StudioColumnConflict;
}

export interface StudioTableColumn {
	constraint?: StudioTableColumnConstraint;
	name: string;
	pk?: boolean;
	type: string;
}

export interface StudioTableIndex {
	columns: string[];
	name: string;
	tableName: string;
	type: "KEY" | "UNIQUE";
}
export interface StudioTableSchema {
	autoIncrement: boolean;
	columns: StudioTableColumn[];
	constraints?: StudioTableColumnConstraint[];
	createScript?: string;
	fts5?: StudioTableFTSv5Options;
	indexes?: StudioTableIndex[];
	pk: string[];
	schemaName: string;
	stats?: StudioTableSchemaStats;
	strict?: boolean;
	tableName?: string;
	type?: "table" | "view";
	withoutRowId?: boolean;
}

/*
 * Type for table schema change. This is used for create table
 * or edit table
 */
export interface StudioTableColumnChange {
	key: string;
	new: StudioTableColumn | null;
	old: StudioTableColumn | null;
}

export interface StudioTableConstraintChange {
	key: string;
	new: StudioTableColumnConstraint | null;
	old: StudioTableColumnConstraint | null;
}
export interface StudioTableSchemaChange {
	columns: StudioTableColumnChange[];
	constraints: StudioTableConstraintChange[];
	indexes: StudioTableIndex[];
	name: { new: string | null; old: string | null };
	schemaName?: string;
}

/**
 * Maps schema names (e.g., "main", "temp", or custom database schemas)
 * to an array of schema items (tables, views, triggers, etc.).
 */
export type StudioSchemas = Record<string, StudioSchemaItem[]>;

export interface StudioSchemaItem {
	name: string;
	schemaName: string;
	tableName?: string;
	tableSchema?: StudioTableSchema;
	type: "table" | "trigger" | "view" | "schema";
}

export type StudioResultValue<T = unknown> = T | undefined | null;
export type StudioResultRow = Record<string, unknown>;

export interface StudioResultStat {
	// Time taken to execute the SQL query on the server (excluding network latency), in milliseconds
	queryDurationMs: number | null;
	// Total duration of the API request, including network latency and server processing, in milliseconds
	requestDurationMs?: number | null;
	rowsAffected: number;
	rowsRead: number | null;
	rowsWritten: number | null;
}

export interface StudioResultHeader {
	columnType?: string;
	displayName: string;
	name: string;
	primaryKey?: boolean;
}

export interface StudioResultSet {
	headers: StudioResultHeader[];
	lastInsertRowid?: number;
	rows: StudioResultRow[];
	stat: StudioResultStat;
}

// Represents a request to modify table rows (insert, update, or delete).
export type StudioTableRowMutationRequest =
	| {
			autoIncrementPkColumn?: string;
			operation: "INSERT";
			pk?: string[];
			values: Record<string, StudioResultValue>;
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
	batch?(statements: string[]): Promise<StudioResultSet[]>; // Optimize for connection that support batch
	query(stmt: string): Promise<StudioResultSet>;
	transaction(statements: string[]): Promise<StudioResultSet[]>;
}

// Column type hint; null if the type can't be determined
export type StudioColumnTypeHint = "TEXT" | "NUMBER" | "BLOB" | null;

export interface StudioSelectFromTableOptions {
	limit: number;
	offset: number;
	orderByColumn?: string;
	orderByDirection?: StudioSortDirection;
	whereRaw?: string;
}

export abstract class IStudioDriver {
	dialect: StudioDialect = "sqlite";
	isSupportDropTable = true;
	isSupportEditTable = true;
	isSupportExplain = false;
	isSupportReturningValue = false;
	isSupportRowid = false;

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

export type StudioResource = {
	databaseId?: string;
	type: "d1";
};

export type DropdownItemBuilderProps = {
	checked?: boolean;
	destructiveAction?: boolean;
	disabled?: boolean;
	icon?: Icon;
	label?: string | React.ReactNode;
	onClick?: () => void;
	/** Optional keyboard shortcut displayed on the right side of the menu item */
	shortcut?: string;
	/** Optional nested menu items, used for creating dropdowns submenus  */
	sub?: DropdownItemBuilderProps[];
	type: "divider" | "checkbox" | "button";
};
