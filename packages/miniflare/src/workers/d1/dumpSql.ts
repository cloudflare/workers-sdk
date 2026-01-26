// NOTE: this file is duplicated between miniflare and d1-workers, and should be kept in sync by hand.
// Please tag someone from the D1 team as a reviewer and they will do this for you.
//
// NOTE: this function duplicates the logic inside SQLite's shell.c.in as close
// as possible, with any deviations noted.
import { SqlStorage } from "@cloudflare/workers-types/experimental";

export function* dumpSql(
	db: SqlStorage,
	options?: {
		noSchema?: boolean;
		noData?: boolean;
		tables?: string[];
	},
	/** Optional stats tracking. Will be mutated in place if provided */
	stats?: { rows_read: number; rows_written: number }
) {
	// WARNING: the caller in D1 assumes non-empty exports, so think carefully before removing this initial yield.
	yield `PRAGMA defer_foreign_keys=TRUE;`;

	// Empty set means include all tables
	const filterTables = new Set(options?.tables || []);
	const { noData, noSchema } = options || {};

	// Taken from SQLite shell.c.in https://github.com/sqlite/sqlite/blob/105c20648e1b05839fd0638686b95f2e3998abcb/src/shell.c.in#L8463-L8469
	// @ts-ignore (SqlStorageStatement needs to be callable)
	const tables_cursor = db.prepare(`
    SELECT name, type, sql
      FROM sqlite_schema AS o
    WHERE (true) AND type=='table'
      AND sql NOT NULL
    ORDER BY tbl_name='sqlite_sequence', rowid;
  `)();
	const tables: { name: string; type: string; sql: string }[] =
		Array.from(tables_cursor);
	if (stats) {
		stats.rows_read += tables_cursor.rowsRead;
		stats.rows_written += tables_cursor.rowsWritten;
	}

	for (const { name: table, sql } of tables) {
		if (filterTables.size > 0 && !filterTables.has(table)) continue;

		if (table === "sqlite_sequence") {
			if (!noSchema) yield `DELETE FROM sqlite_sequence;`;
		} else if (table.match(/^sqlite_stat./)) {
			// This feels like it should really appear _after_ the contents of sqlite_stat[1,4] but I'm choosing
			// to match SQLite's dump output exactly so writing it immediately like they do.
			if (!noSchema) yield `ANALYZE sqlite_schema;`;
		} else if (sql.startsWith(`CREATE VIRTUAL TABLE`)) {
			throw new Error(
				`D1 Export error: cannot export databases with Virtual Tables (fts5)`
			);
		} else if (table.startsWith("_cf_") || table.startsWith("sqlite_")) {
			continue;
		} else {
			// SQLite dump has an extremely weird behaviour where, if the table was explicitly
			// quoted i.e. "Table", then in the dump it has `IF NOT EXISTS` injected. I don't understand
			// why, but on the off chance there's a good reason to I am following suit.
			if (sql.match(/CREATE TABLE ['"].*/)) {
				if (!noSchema) yield `CREATE TABLE IF NOT EXISTS ${sql.substring(13)};`;
			} else {
				if (!noSchema) yield `${sql};`;
			}
		}

		if (noData) continue;
		// eslint-disable-next-line workers-sdk/no-unsafe-command-execution
		const columns_cursor = db.exec(`PRAGMA table_info=${escapeId(table)}`);

		const columns = Array.from(columns_cursor) as {
			cid: string;
			name: string;
			type: string;
			notnull: number;
			dflt_val: string | null;
			pk: number;
		}[];
		if (stats) {
			stats.rows_read += columns_cursor.rowsRead;
			stats.rows_written += columns_cursor.rowsWritten;
		}

		const select = `SELECT ${columns.map((c) => escapeId(c.name)).join(", ")} FROM ${escapeId(table)};`;
		const rows_cursor = db.exec(select);
		for (const dataRow of rows_cursor.raw()) {
			const formattedCells = dataRow.map((cell: unknown, i: number) => {
				const colType = columns[i].type;
				const cellType = typeof cell;
				if (cell === null) {
					return "NULL";
				} else if (cellType === "number") {
					return cell;
				} else if (cellType === "string") {
					return outputQuotedEscapedString(cell);
				} else if (cell instanceof ArrayBuffer) {
					return `X'${Array.prototype.map
						.call(new Uint8Array(cell), (b) => b.toString(16).padStart(2, "0"))
						.join("")}'`;
				} else {
					console.error({
						message: "dumpSql: unexpected cell type",
						colType,
						cellType,
						cell,
						column: columns[i],
					});
					return "ERROR";
				}
			});

			yield `INSERT INTO ${escapeId(table)} VALUES(${formattedCells.join(",")});`;
		}
		if (stats) {
			stats.rows_read += rows_cursor.rowsRead;
			stats.rows_written += rows_cursor.rowsWritten;
		}
	}

	if (!noSchema) {
		// Taken from SQLite shell.c.in https://github.com/sqlite/sqlite/blob/105c20648e1b05839fd0638686b95f2e3998abcb/src/shell.c.in#L8473-L8478
		const rest_of_schema = db.exec(
			[
				"SELECT name, sql",
				"FROM sqlite_schema AS o",
				"WHERE (true) AND sql NOT NULL",
				"  AND type IN ('index', 'trigger', 'view')",
				// 'DESC' appears in the code linked above but the observed behaviour of SQLite appears otherwise
				"ORDER BY type COLLATE NOCASE",
			].join(" ")
		);
		for (const { name, sql } of rest_of_schema) {
			if (filterTables.size > 0 && !filterTables.has(name as string)) continue;
			yield `${sql};`;
		}
		if (stats) {
			stats.rows_read += rest_of_schema.rowsRead;
			stats.rows_written += rest_of_schema.rowsWritten;
		}
	}
}

// Ported `output_quoted_escaped_string` from https://github.com/sqlite/sqlite/blob/master/src/shell.c.in#L1799-L1862
function outputQuotedEscapedString(cell: unknown) {
	let lfs = false;
	let crs = false;

	const quotesOrNewlinesRegexp = /'|(\n)|(\r)/g;

	// Function to replace ' with '', while also tracking whether the string contains any \r or \n chars
	const escapeQuotesDetectingNewlines = (_: string, lf: string, cr: string) => {
		if (lf) {
			lfs = true;
			return `\\n`;
		}
		if (cr) {
			crs = true;
			return `\\r`;
		}
		return `''`;
	};

	const escaped_string = (cell as string).replace(
		quotesOrNewlinesRegexp,
		escapeQuotesDetectingNewlines
	);
	let output_string = `'${escaped_string}'`;
	if (crs) output_string = `replace(${output_string},'\\r',char(13))`;
	if (lfs) output_string = `replace(${output_string},'\\n',char(10))`;
	return output_string;
}

// Ported from quoteChar: https://github.com/sqlite/sqlite/blob/378bf82e2bc09734b8c5869f9b148efe37d29527/src/shell.c.in#L990
export function sqliteQuote(token: string) {
	// Empty input
	return token.length === 0 ||
		// Doesn't start with alpha or underscore
		!token.match(/^[a-zA-Z_]/) ||
		token.match(/\W/) ||
		SQLITE_KEYWORDS.has(token.toUpperCase())
		? `"${token}"`
		: token;
}

/**
 * Escape an identifier for use in SQL statements.
 * @param id - The identifier to escape.
 * @returns
 */
function escapeId(id: string) {
	return `"${id.replace(/"/g, '""')}"`;
}

// List taken from `aKeywordTable` inhttps://github.com/sqlite/sqlite/blob/378bf82e2bc09734b8c5869f9b148efe37d29527/tool/mkkeywordhash.c#L172
// prettier-ignore
export const SQLITE_KEYWORDS = new Set([
  "ABORT", "ACTION", "ADD", "AFTER", "ALL", "ALTER", "ALWAYS", "ANALYZE", "AND", "AS", "ASC",
  "ATTACH", "AUTOINCREMENT", "BEFORE", "BEGIN", "BETWEEN", "BY", "CASCADE", "CASE", "CAST",
  "CHECK", "COLLATE", "COLUMN", "COMMIT", "CONFLICT", "CONSTRAINT", "CREATE", "CROSS", "CURRENT",
  "CURRENT_DATE", "CURRENT_TIME", "CURRENT_TIMESTAMP", "DATABASE", "DEFAULT", "DEFERRED",
  "DEFERRABLE", "DELETE", "DESC", "DETACH", "DISTINCT", "DO", "DROP", "END", "EACH", "ELSE",
  "ESCAPE", "EXCEPT", "EXCLUSIVE", "EXCLUDE", "EXISTS", "EXPLAIN", "FAIL", "FILTER", "FIRST",
  "FOLLOWING", "FOR", "FOREIGN", "FROM", "FULL", "GENERATED", "GLOB", "GROUP", "GROUPS", "HAVING",
  "IF", "IGNORE", "IMMEDIATE", "IN", "INDEX", "INDEXED", "INITIALLY", "INNER", "INSERT", "INSTEAD",
  "INTERSECT", "INTO", "IS", "ISNULL", "JOIN", "KEY", "LAST", "LEFT", "LIKE", "LIMIT", "MATCH",
  "MATERIALIZED", "NATURAL", "NO", "NOT", "NOTHING", "NOTNULL", "NULL", "NULLS", "OF", "OFFSET",
  "ON", "OR", "ORDER", "OTHERS", "OUTER", "OVER", "PARTITION", "PLAN", "PRAGMA", "PRECEDING",
  "PRIMARY", "QUERY", "RAISE", "RANGE", "RECURSIVE", "REFERENCES", "REGEXP", "REINDEX", "RELEASE",
  "RENAME", "REPLACE", "RESTRICT", "RETURNING", "RIGHT", "ROLLBACK", "ROW", "ROWS", "SAVEPOINT",
  "SELECT", "SET", "TABLE", "TEMP", "TEMPORARY", "THEN", "TIES", "TO", "TRANSACTION", "TRIGGER",
  "UNBOUNDED", "UNION", "UNIQUE", "UPDATE", "USING", "VACUUM", "VALUES", "VIEW", "VIRTUAL", "WHEN",
  "WHERE", "WINDOW", "WITH", "WITHOUT"
]);
