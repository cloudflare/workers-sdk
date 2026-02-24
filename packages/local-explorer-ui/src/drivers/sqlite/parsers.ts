import { tokenizeSQL } from "../../utils/studio/sql";
import type {
	StudioColumnConflict,
	StudioSortDirection,
	StudioSQLToken,
	StudioTableColumn,
	StudioTableColumnConstraint,
	StudioTableFTSv5Options,
	StudioTableIndex,
	StudioTableSchema,
} from "../../types/studio";

/**
 * Strips surrounding quote characters (`"`, `` ` ``, `[`/`]`) from a SQL
 * identifier and un-doubles any escaped double-quotes within.
 *
 * @param str - The raw identifier string, possibly quoted.
 *
 * @returns The unescaped identifier.
 */
function unescapeIdentity(str: string): string {
	let r = str.replace(/^["`[]/g, "");
	r = r.replace(/["`\]]$/g, "");
	r = r.replace(/""/g, `"`);
	return r;
}

/**
 * A token-based cursor for navigating and consuming a sequence of
 * {@link StudioSQLToken} values. Automatically skips whitespace tokens
 * when advancing. Used internally by the SQLite parser functions to
 * walk through tokenised SQL statements.
 */
class CursorV2 {
	private ptr: number = 0;

	/**
	 * @param tokens - The token array to iterate over. Leading and
	 *   trailing whitespace tokens are trimmed during construction.
	 */
	constructor(private tokens: StudioSQLToken[]) {
		// Trim whitespace tokens from the beginning and end
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Length check above guarantees this exists
		while (this.tokens.length > 0 && this.tokens[0]!.type === "WHITESPACE") {
			this.tokens.shift();
		}

		while (
			this.tokens.length > 0 &&
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Length check above guarantees this exists
			this.tokens[this.tokens.length - 1]!.type === "WHITESPACE"
		) {
			this.tokens.pop();
		}

		this.tokens = tokens;
	}

	/**
	 * Returns the current pointer position within the token array.
	 */
	getPointer(): number {
		return this.ptr;
	}

	/**
	 * Concatenates the raw token values between two indices (exclusive end).
	 *
	 * @param start - The start index (inclusive).
	 * @param end - The end index (exclusive).
	 *
	 * @returns The reconstructed SQL fragment.
	 */
	toStringRange(start: number, end: number): string {
		return this.tokens
			.slice(start, end)
			.map((t) => t.value)
			.join("");
	}

	/**
	 * Returns the raw string value of the current token, or `""` if at end.
	 */
	read(): string {
		if (this.end()) {
			return "";
		}

		// `end()` check above guarantees ptr is within bounds
		const token = this.tokens[this.ptr] as StudioSQLToken;
		return token.value;
	}

	/**
	 * Consumes the current token as a "block": if the current token is an
	 * opening parenthesis, the entire parenthesised group is consumed and
	 * returned as a string. Otherwise, a single token is consumed.
	 *
	 * @returns The consumed string content.
	 */
	consumeBlock(): string {
		if (this.match("(")) {
			return this.consumeParen().toString();
		}

		return this.consume();
	}

	/**
	 * Returns the type of the current token (e.g. `STRING`, `NUMBER`, `OPERATOR`).
	 */
	currentType(): StudioSQLToken["type"] {
		// Callers check `end()` before calling; `ptr` is within bounds
		const token = this.tokens[this.ptr] as StudioSQLToken;
		return token.type;
	}

	/**
	 * Consumes a balanced parenthesised group starting from the current `(`
	 * token and returns a new {@link CursorV2} over the inner tokens.
	 * Advances past the closing `)`.
	 *
	 * @returns A new cursor spanning the tokens inside the parentheses.
	 *
	 * @throws If the current token is not `(` or no matching `)` is found.
	 */
	consumeParen(): CursorV2 {
		if (this.read() !== "(") {
			throw new Error("Expecting (");
		}

		const start = this.ptr + 1;
		let counter = 1;

		// Find the matching closing paren
		while (counter > 0) {
			if (!this.next()) {
				throw new Error("Expecting closing paren");
			}
			if (this.read() === "(") {
				counter++;
			}
			if (this.read() === ")") {
				counter--;
			}
		}

		const newCursor = new CursorV2(this.tokens.slice(start, this.ptr));
		this.next();

		return newCursor;
	}

	/** Reads the current token value and advances the cursor. */
	consume(): string {
		const value = this.read();
		this.next();
		return value;
	}

	/** Reads the current token as an unescaped identifier and advances the cursor. */
	consumeIdentifier(): string {
		const value = unescapeIdentity(this.read());
		this.next();
		return value;
	}

	/**
	 * Asserts that the current token matches the expected value (case-insensitive)
	 * and advances the cursor. Throws if the token does not match.
	 *
	 * @param value - The expected token value.
	 *
	 * @throws If the current token does not match.
	 */
	expectToken(value: string): void {
		if (!this.match(value)) {
			throw new Error(`Expecting ${value}`);
		}
		this.next();
	}

	/**
	 * If the current token matches the expected value, advances the cursor.
	 * Otherwise does nothing.
	 *
	 * @param value - The optional token value to consume.
	 */
	expectTokenOptional(value: string): void {
		if (this.match(value)) {
			this.next();
		}
	}

	/**
	 * Optionally consumes a sequence of tokens. If the first value matches,
	 * all subsequent values are consumed with {@link expectToken} (required).
	 * If the first value does not match, nothing is consumed.
	 *
	 * @param values - The ordered sequence of token values.
	 */
	expectTokensOptional(values: string[]): void {
		if (values.length === 0) {
			return;
		}

		const [value] = values as [string];
		if (this.match(value)) {
			this.next();
			for (const v of values.slice(1)) {
				this.expectToken(v);
			}
		}
	}

	/**
	 * Asserts and consumes a required sequence of tokens. Each value is
	 * consumed with {@link expectToken}.
	 *
	 * @param values - The ordered sequence of expected token values.
	 */
	expectTokens(values: string[]): void {
		for (const v of values) {
			this.expectToken(v);
		}
	}

	/**
	 * Next will skip to valid non-whitespace token
	 *
	 * @returns true if there is a next token, false otherwise
	 */
	next(): boolean {
		for (this.ptr = this.ptr + 1; this.ptr < this.tokens.length; this.ptr++) {
			if (this.currentType() !== "WHITESPACE") {
				return true;
			}
		}

		return false;
	}

	/**
	 * Checks whether the current token matches a value (case-insensitive)
	 * without consuming it.
	 *
	 * @param value - The value to compare against.
	 *
	 * @returns `true` if the current token matches, `false` otherwise or if at end.
	 */
	match(value: string): boolean {
		if (this.end()) {
			return false;
		}
		return this.read().toLowerCase() === value.toLowerCase();
	}

	/**
	 * Checks whether the current token matches any of the provided values
	 * (case-insensitive) without consuming it.
	 *
	 * @param values - The candidate values to match against.
	 *
	 * @returns `true` if any value matches the current token.
	 */
	matchTokens(values: string[]): boolean {
		return values.some((v) => this.read().toLowerCase() === v.toLowerCase());
	}

	/**
	 * Returns `true` if the cursor has passed the last token.
	 */
	end(): boolean {
		return this.ptr >= this.tokens.length;
	}

	/**
	 * Reconstructs the full SQL fragment from all tokens.
	 */
	toString(): string {
		return this.tokens.map((t) => t.value).join("");
	}

	/**
	 * Reconstructs the SQL fragment wrapped in parentheses.
	 */
	toStringWithParen(): string {
		return "(" + this.toString() + ")";
	}
}

/**
 * Parses a single column definition from a `CREATE TABLE` body.
 * Extracts the column name, data type (including parenthesised type
 * parameters like `VARCHAR(255)`), and any inline column constraints.
 *
 * @param schemaName - The schema name, passed through to constraint parsing.
 * @param cursor - The cursor positioned at the start of the column definition.
 *
 * @returns The parsed column, or `null` if no column name is found.
 */
function parseColumnDef(
	schemaName: string,
	cursor: CursorV2
): StudioTableColumn | null {
	const columnName = cursor.consumeIdentifier();
	if (!columnName) {
		return null;
	}

	let dataType = cursor.read();
	if (
		[
			",",
			"CHECK",
			"COLLATE",
			"CONSTRAINT",
			"DEFAULT",
			"GENERATED",
			"NOT",
			"PRIMARY",
			"REFERENCES",
			"UNIQUE",
		].includes(dataType.toUpperCase())
	) {
		dataType = "";
	} else {
		cursor.next();
	}

	// Handle case such as VARCHAR(255) where we need to read
	// something inside the parens
	if (cursor.match("(")) {
		dataType += cursor.consumeParen().toStringWithParen();
	}

	const constraint = parseColumnConstraint(schemaName, cursor);

	return {
		name: columnName,
		pk: constraint?.primaryKey,
		constraint,
		type: dataType,
	};
}

/**
 * Attempts to parse an `ON CONFLICT` clause from the current cursor
 * position. Returns the conflict resolution strategy (e.g. `ROLLBACK`,
 * `ABORT`, `FAIL`, `IGNORE`, `REPLACE`) or `undefined` if no such
 * clause is present.
 *
 * @param cursor - The cursor positioned where an ON CONFLICT clause may appear.
 *
 * @returns The conflict strategy, or `undefined`.
 */
function parseConstraintConflict(
	cursor: CursorV2
): StudioColumnConflict | undefined {
	if (!cursor.match("ON")) {
		return;
	}
	cursor.next();

	if (!cursor.match("CONFLICT")) {
		return;
	}
	cursor.next();

	if (!cursor.end()) {
		const conflict = cursor.read().toUpperCase();
		cursor.next();
		return conflict as StudioColumnConflict;
	}

	return;
}

/**
 * Parses a comma-separated list of column identifiers from a cursor,
 * typically from inside a parenthesised group.
 *
 * @param columnPtr - The cursor over the column list tokens.
 *
 * @returns An array of unescaped column name strings.
 */
function parseColumnList(columnPtr: CursorV2): string[] {
	const columns: string[] = [];

	while (!columnPtr.end()) {
		columns.push(columnPtr.consumeIdentifier());

		if (!columnPtr.match(",")) {
			break;
		}
		columnPtr.next();
	}

	return columns;
}

/**
 * Recursively parses column-level and table-level constraints from the
 * current cursor position. Handles `CONSTRAINT`, `PRIMARY KEY`, `NOT NULL`,
 * `NULL`, `UNIQUE`, `DEFAULT`, `CHECK`, `COLLATE`, `FOREIGN KEY`, `REFERENCES`,
 * and `GENERATED ALWAYS AS`. Constraints are merged via recursive calls so
 * that multiple constraints on a single column are combined into one
 * object.
 *
 * @param schemaName - The schema name, used when resolving foreign key references.
 * @param cursor - The cursor positioned at the start of a constraint keyword.
 *
 * @returns The parsed constraint object, or `undefined` if no constraint is found.
 */
function parseColumnConstraint(
	schemaName: string,
	cursor: CursorV2
): StudioTableColumnConstraint | undefined {
	if (cursor.match("CONSTRAINT")) {
		cursor.next();
		const constraintName = cursor.consume();

		return {
			...parseColumnConstraint(schemaName, cursor),
			name: constraintName,
		};
	} else if (cursor.match("PRIMARY")) {
		let primaryKeyOrder: StudioSortDirection | undefined;
		let primaryColumns: string[] | undefined;
		let autoIncrement = false;

		cursor.next();
		if (!cursor.match("KEY")) {
			throw new Error("PRIMARY must follow by KEY");
		}

		cursor.next();

		if (cursor.match("(")) {
			primaryColumns = parseColumnList(cursor.consumeParen());
		}

		if (cursor.match("ASC")) {
			primaryKeyOrder = "ASC";
			cursor.next();
		} else if (cursor.match("DESC")) {
			primaryKeyOrder = "DESC";
			cursor.next();
		}

		const conflict = parseConstraintConflict(cursor);

		if (cursor.match("AUTOINCREMENT")) {
			autoIncrement = true;
			cursor.next();
		}

		return {
			primaryKey: true,
			primaryKeyOrder,
			primaryColumns,
			autoIncrement,
			primaryKeyConflict: conflict,
			...parseColumnConstraint(schemaName, cursor),
		};
	} else if (cursor.match("NOT")) {
		cursor.next();
		if (!cursor.match("NULL")) {
			throw new Error("NOT should follow by NULL");
		}
		cursor.next();

		const conflict = parseConstraintConflict(cursor);
		return {
			notNull: true,
			notNullConflict: conflict,
			...parseColumnConstraint(schemaName, cursor),
		};
	} else if (cursor.match("NULL")) {
		cursor.next();
		return {
			notNull: false,
			...parseColumnConstraint(schemaName, cursor),
		};
	} else if (cursor.match("UNIQUE")) {
		let uniqueColumns: string[] | undefined;

		cursor.next();

		if (cursor.read() === "(") {
			uniqueColumns = parseColumnList(cursor.consumeParen());
		}

		const conflict = parseConstraintConflict(cursor);

		return {
			unique: true,
			uniqueConflict: conflict,
			uniqueColumns,
			...parseColumnConstraint(schemaName, cursor),
		};
	} else if (cursor.match("DEFAULT")) {
		let defaultValue: unknown;
		let defaultExpression: string | undefined;

		cursor.next();

		if (cursor.currentType() === "STRING") {
			defaultValue = cursor.read().slice(1, -1);
			cursor.next();
		} else if (cursor.currentType() === "OPERATOR") {
			if (cursor.match("+")) {
				cursor.next();
				defaultValue = Number(cursor.read());
				cursor.next();
			} else if (cursor.match("-")) {
				cursor.next();
				defaultValue = -Number(cursor.read());
				cursor.next();
			}
		} else if (cursor.currentType() === "NUMBER") {
			defaultValue = Number(cursor.read());
			cursor.next();
		} else if (cursor.match("(")) {
			defaultExpression = cursor.consumeParen().toString();
		} else if (
			cursor.match("current_timestamp") ||
			cursor.match("current_time") ||
			cursor.match("current_date") ||
			cursor.match("true") ||
			cursor.match("false") ||
			cursor.match("null")
		) {
			defaultExpression = cursor.read();
			cursor.next();
		}

		return {
			defaultValue,
			defaultExpression,
			...parseColumnConstraint(schemaName, cursor),
		};
	} else if (cursor.match("CHECK")) {
		cursor.next();
		const expr = cursor.consumeBlock();

		return {
			checkExpression: expr,
			...parseColumnConstraint(schemaName, cursor),
		};
	} else if (cursor.match("COLLATE")) {
		cursor.next();

		const collationName = cursor.read();
		cursor.next();

		return {
			collate: collationName,
			...parseColumnConstraint(schemaName, cursor),
		};
	} else if (cursor.match("FOREIGN")) {
		cursor.next();

		if (!cursor.match("KEY")) {
			throw new Error("FOREIGN should follow by KEY");
		}
		cursor.next();

		const parens = cursor.consumeParen();
		const columns = parseColumnList(parens);

		const refConstraint = parseColumnConstraint(schemaName, cursor);

		return {
			foreignKey: {
				foreignSchemaName: schemaName,
				foreignTableName: refConstraint?.foreignKey?.foreignTableName ?? "",
				foreignColumns: refConstraint?.foreignKey?.foreignColumns ?? [],
				columns,
			},
		};
	} else if (cursor.match("REFERENCES")) {
		cursor.next();
		const foreignTableName = cursor.consumeIdentifier();
		let foreignColumns: string[] = [];

		// Trying to find the parens by skipping all other rule
		// We may visit more rule in the future, but at the moment
		// it is too complex to handle all the rules.
		// We will just grab foreign key column first
		while (!cursor.end() && !cursor.match("(") && !cursor.match(",")) {
			cursor.next();
		}

		if (cursor.match("(")) {
			foreignColumns = parseColumnList(cursor.consumeParen());
		}

		return {
			foreignKey: {
				foreignSchemaName: schemaName,
				foreignTableName,
				foreignColumns,
			},
			...parseColumnConstraint(schemaName, cursor),
		};
	} else if (cursor.match("GENERATED")) {
		cursor.next();
		if (!cursor.match("ALWAYS")) {
			throw new Error("GENERATED should follow by ALWAYS");
		}

		cursor.next();
		if (!cursor.match("AS")) {
			throw new Error("GENERATED ALWAYS should follow by AS");
		}

		cursor.next();
		const expr = cursor.consumeBlock();

		const virtualColumnType = cursor.match("STORED") ? "STORED" : "VIRTUAL";

		return {
			generatedType: virtualColumnType,
			generatedExpression: expr,
			...parseColumnConstraint(schemaName, cursor),
		};
	}

	return undefined;
}

/**
 * Parses the body of a `CREATE TABLE` statement (the content inside the
 * outer parentheses) into column definitions and table-level constraints.
 * Column definitions are expected to appear before any table-level
 * constraints. After parsing, table-level PRIMARY KEY constraints are
 * applied back to the corresponding column objects, and foreign key
 * columns with empty `foreignColumns` are backfilled with the column name.
 *
 * @param schemaName - The schema name, passed to constraint parsers.
 * @param cursor - A cursor over the tokens inside the `CREATE TABLE` parentheses.
 *
 * @returns An object containing the parsed columns and constraints.
 */
function parseTableDefinition(
	schemaName: string,
	cursor: CursorV2
): {
	columns: StudioTableColumn[];
	constraints: StudioTableColumnConstraint[];
} {
	let moveNext = true;
	let hasConstraint = false;
	const columns = new Array<StudioTableColumn>();
	const constraints = new Array<StudioTableColumnConstraint>();

	while (moveNext) {
		moveNext = false;

		if (
			cursor.matchTokens([
				"CHECK",
				"CONSTRAINT",
				"FOREIGN",
				"PRIMARY",
				"UNIQUE",
			])
		) {
			const constraint = parseColumnConstraint(schemaName, cursor);
			if (constraint) {
				hasConstraint = true;
				constraints.push(constraint);
				moveNext = true;
			}
		} else if (!hasConstraint) {
			// Column definitions should appear before any constraints.
			// If we have already encountered any constraints, we will stop parsing column definitions.
			// This makes it more robust in the face of missing commas between constraint definitions,
			// which could otherwise cause it to mistakenly interpret a subsequent constraint as a column definition.
			const column = parseColumnDef(schemaName, cursor);
			if (column) {
				columns.push(column);
				moveNext = true;
			}
		}

		while (cursor.read() !== "," && !cursor.end()) {
			cursor.next();
		}

		if (cursor.end()) {
			break;
		}
		cursor.next();
	}

	for (const constraint of constraints) {
		if (constraint.primaryKey && constraint.primaryColumns) {
			for (const pkColumn of constraint.primaryColumns) {
				const column = columns.find(
					(col) => pkColumn.toLowerCase() === col.name.toLowerCase()
				);

				if (column) {
					column.pk = true;
				}
			}
		}
	}

	for (const column of columns) {
		const fk = column.constraint?.foreignKey;
		if (fk?.foreignColumns && fk.foreignColumns.length === 0) {
			fk.foreignColumns = [column.name];
		}
	}

	return {
		columns,
		constraints,
	};
}

/**
 * Parses FTS5 virtual table options from the arguments inside
 * `CREATE VIRTUAL TABLE ... USING FTS5(...)`. Extracts the `content`
 * and `content_rowid` options when present.
 *
 * @param cursor - A cursor over the tokens inside the FTS5 argument list.
 *
 * @returns The parsed FTS5 options.
 */
function parseFTS5(cursor: CursorV2): StudioTableFTSv5Options {
	if (!cursor) {
		return {};
	}

	let content: string | undefined;
	let contentRowId: string | undefined;

	const ptr = cursor;
	while (!ptr.end()) {
		if (ptr.match("content")) {
			ptr.next();
			if (ptr.match("=")) {
				ptr.next();
				if (!ptr.end()) {
					content = unescapeIdentity(ptr.read());
					ptr.next();
				}
			}
		} else if (ptr.match("content_rowid")) {
			ptr.next();
			if (ptr.match("=")) {
				ptr.next();
				if (!ptr.end()) {
					contentRowId = unescapeIdentity(ptr.read());
					ptr.next();
				}
			}
		}

		ptr.next();
	}

	return {
		content,
		contentRowId,
	};
}

/**
 * Parses trailing table options that appear after the closing
 * parenthesis of a CREATE TABLE statement (`WITHOUT ROWID` and/or
 * `STRICT`). Options may be comma-separated and are parsed recursively.
 *
 * @param cursor - The cursor positioned after the CREATE TABLE body.
 *
 * @returns An object with `withoutRowId` and/or `strict` flags, or `undefined`.
 */
function parseTableOption(cursor: CursorV2):
	| {
			strict?: boolean;
			withoutRowId?: boolean;
	  }
	| undefined {
	if (cursor.match("WITHOUT")) {
		cursor.next();
		if (cursor.match("ROWID")) {
			cursor.next();
			if (cursor.match(",")) {
				cursor.next();
				return {
					withoutRowId: true,
					...parseTableOption(cursor),
				};
			} else {
				return {
					withoutRowId: true,
				};
			}
		}
	} else if (cursor.match("STRICT")) {
		cursor.next();
		if (cursor.match(",")) {
			cursor.next();
			return {
				strict: true,
				...parseTableOption(cursor),
			};
		} else {
			return {
				strict: true,
			};
		}
	}
}

/**
 * Parses a SQL `CREATE TABLE` statement into a structured table definition.
 * Supports regular tables, TEMP/TEMPORARY tables, virtual tables (FTS5),
 * and table options (WITHOUT ROWID, STRICT).
 *
 * This parser follows the SQLite specification:
 * {@link https://www.sqlite.org/lang_createtable.html}
 *
 * @param schemaName - The schema the table belongs to (e.g. `"main"`).
 * @param sql - The raw `CREATE TABLE` SQL string to parse.
 *
 * @returns A fully parsed {@link StudioTableSchema} including columns,
 *   constraints, primary keys, auto-increment, FTS5 options, and table flags.
 */
export function parseSQLiteCreateTableScript(
	schemaName: string,
	sql: string
): StudioTableSchema {
	const cursor = new CursorV2(
		tokenizeSQL(sql, "sqlite").filter((token) => token.type !== "COMMENT")
	);

	cursor.expectToken("CREATE");
	cursor.expectTokenOptional("TEMP");
	cursor.expectTokenOptional("TEMPORARY");
	cursor.expectTokenOptional("VIRTUAL");
	cursor.expectToken("TABLE");
	cursor.expectTokensOptional(["IF", "NOT", "EXISTS"]);

	const tableName = cursor.consumeIdentifier();

	// Check for FTS5
	let fts5: StudioTableFTSv5Options | undefined;

	if (cursor.match("USING")) {
		cursor.next();
		if (cursor.match("FTS5")) {
			cursor.next();
			fts5 = parseFTS5(cursor.consumeParen());
		}
	}

	const defs = cursor.match("(")
		? parseTableDefinition(schemaName, cursor.consumeParen())
		: { columns: [], constraints: [] };

	// Parsing table options
	const pk = defs.columns.filter((col) => col.pk).map((col) => col.name);

	const autoIncrement = defs.columns.some(
		(col) => !!col.constraint?.autoIncrement
	);

	return {
		schemaName,
		tableName,
		...defs,
		autoIncrement,
		fts5,
		pk,
		...parseTableOption(cursor),
	};
}

/**
 * Parses a SQL `CREATE INDEX` statement into a structured index definition.
 * Handles both regular and UNIQUE indexes, and extracts the index name,
 * target table, and indexed column list.
 *
 * @param sql - The raw `CREATE INDEX` SQL string to parse.
 *
 * @returns The parsed {@link StudioTableIndex}.
 */
export function parseSQLiteIndexScript(sql: string): StudioTableIndex {
	const cursor = new CursorV2(tokenizeSQL(sql, "sqlite"));

	const result: StudioTableIndex = {
		columns: [],
		name: "",
		tableName: "",
		type: "KEY",
	};

	cursor.expectToken("CREATE");
	if (cursor.match("UNIQUE")) {
		result.type = "UNIQUE";
		cursor.next();
	}

	cursor.expectToken("INDEX");
	cursor.expectTokensOptional(["IF", "NOT", "EXISTS"]);

	result.name = cursor.consumeIdentifier();
	cursor.expectToken("ON");

	result.tableName = cursor.consumeIdentifier();

	if (cursor.match("(")) {
		result.columns = parseColumnList(cursor.consumeParen());
	}

	return result;
}
