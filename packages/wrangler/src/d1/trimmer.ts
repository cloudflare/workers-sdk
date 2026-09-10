// Note that sqlite has many ways to trigger a transaction: https://www.sqlite.org/lang_transaction.html
// this files (initial?) aim is to detect SQL files created by sqlite's .dump CLI command, and strip out the wrapping transaction in the sql file.

import { UserError } from "@cloudflare/workers-utils";

const BEGIN_STATEMENT = "BEGIN TRANSACTION;";
const COMMIT_STATEMENT = "COMMIT;";

/**
 * A function to remove transaction statements from the start and end of SQL files, as the D1 API already does it for us.
 * @param sql a potentially large string of SQL statements
 * @returns the initial input, without `BEGIN TRANSACTION`/`COMMIT`
 */
export function trimSqlQuery(sql: string): string {
	if (!mayContainTransaction(sql)) {
		return sql;
	}

	// Work out the offsets on a masked copy, so a `BEGIN TRANSACTION;` or
	// `COMMIT;` that only appears inside string data is never cut out. The mask
	// is the same length as the input, so its indices apply to `sql` directly.
	const masked = stripStringsAndComments(sql);
	const beginIndex = masked.indexOf(BEGIN_STATEMENT);
	// The dump wraps the whole file, so the closing COMMIT is the last one.
	const commitIndex = masked.lastIndexOf(COMMIT_STATEMENT);

	if (beginIndex === -1 || commitIndex === -1) {
		throw new UserError(
			"Wrangler could not process the provided SQL file, as it contains an unbalanced transaction.\nD1 runs your SQL in a transaction for you.\nPlease export an SQL file from your SQLite database and try again.",
			{
				telemetryMessage: "d1 execute sql file contains an unbalanced transaction",
			}
		);
	}

	const trimmedSql =
		sql.slice(0, beginIndex) +
		sql.slice(beginIndex + BEGIN_STATEMENT.length, commitIndex) +
		sql.slice(commitIndex + COMMIT_STATEMENT.length);
	//if the trimmed output STILL contains transactions, we should just tell them to remove them and try again.
	if (mayContainTransaction(trimmedSql)) {
		throw new UserError(
			"Wrangler could not process the provided SQL file, as it contains several transactions.\nD1 runs your SQL in a transaction for you.\nPlease export an SQL file from your SQLite database and try again.",
			{
				telemetryMessage: "d1 execute sql file contains multiple transactions",
			}
		);
	}

	return trimmedSql;
}

// sqlite may start an sql dump file with pragmas,
// so we can't just use sql.startsWith here.
export function mayContainTransaction(sql: string): boolean {
	return containsTransactionKeyword(sql);
}

/**
 * Returns true if `sql` still contains a transaction keyword once string
 * literals, quoted identifiers and comments are masked out. A stray `COMMIT`
 * counts: a file that commits without an opening `BEGIN TRANSACTION` is just as
 * unusable to us as one with several transactions, and the caller turns this
 * into the friendly error rather than letting D1 reject it.
 */

/**
 * Returns true if `sql` contains a `BEGIN TRANSACTION` keyword that is part of an
 * actual statement, rather than appearing inside a string literal, an identifier,
 * or a comment.
 *
 * A naive `sql.includes("BEGIN TRANSACTION")` reports false positives whenever the
 * phrase happens to appear inside the data being inserted/updated (for example a
 * row whose text value mentions `BEGIN TRANSACTION`), which made `wrangler d1
 * execute` reject perfectly valid SQL. We scan the input while skipping over
 * quoted strings and comments so that only real SQL tokens are considered.
 */
function containsTransactionKeyword(sql: string): boolean {
	const masked = stripStringsAndComments(sql);
	return masked.includes("BEGIN TRANSACTION") || masked.includes("COMMIT");
}

/**
 * Returns `sql` with the contents of string literals (single, double, backtick
 * and bracket quoted) and comments (`-- ...` line comments and block comments)
 * replaced by spaces. The result is only suitable for keyword detection, not for
 * execution, but it lets us search for SQL keywords without matching text that
 * lives inside string or comment content.
 *
 * The output is the same length as the input, so an index into the mask is also
 * a valid index into `sql`.
 */
function stripStringsAndComments(sql: string): string {
	let out = "";
	let i = 0;
	const len = sql.length;

	while (i < len) {
		const char = sql[i];

		// Line comments: -- ... up to (but not including) the end of line.
		if (char === "-" && sql[i + 1] === "-") {
			out += "  ";
			i += 2;
			while (i < len && sql[i] !== "\n") {
				out += " ";
				i++;
			}
			continue;
		}

		// Block comments: /* ... */
		if (char === "/" && sql[i + 1] === "*") {
			const start = i;
			i += 2;
			while (i < len && !(sql[i] === "*" && sql[i + 1] === "/")) {
				i++;
			}
			i = Math.min(i + 2, len);
			out += " ".repeat(i - start);
			continue;
		}

		// Quoted strings/identifiers. SQLite escapes the quote character by
		// doubling it (e.g. 'it''s'), so a doubled quote does not end the string.
		if (char === "'" || char === '"' || char === "`" || char === "[") {
			// SQLite also treats [bracketed] text as a quoted identifier, so an
			// identifier such as [weird BEGIN TRANSACTION col] must be masked too.
			const quote = char === "[" ? "]" : char;
			const start = i;
			i++;
			while (i < len) {
				if (sql[i] === quote) {
					// A doubled quote is an escape rather than the end of the
					// token (e.g. 'it''s'). Brackets have no such escape.
					if (quote !== "]" && sql[i + 1] === quote) {
						i += 2;
						continue;
					}
					i++;
					break;
				}
				i++;
			}
			out += " ".repeat(i - start);
			continue;
		}

		out += char;
		i++;
	}

	return out;
}
