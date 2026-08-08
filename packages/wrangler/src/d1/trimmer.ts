// Note that sqlite has many ways to trigger a transaction: https://www.sqlite.org/lang_transaction.html
// this files (initial?) aim is to detect SQL files created by sqlite's .dump CLI command, and strip out the wrapping transaction in the sql file.

import { UserError } from "@cloudflare/workers-utils";

/**
 * A function to remove transaction statements from the start and end of SQL files, as the D1 API already does it for us.
 * @param sql a potentially large string of SQL statements
 * @returns the initial input, without `BEGIN TRANSACTION`/`COMMIT`
 */
export function trimSqlQuery(sql: string): string {
	if (!mayContainTransaction(sql)) {
		return sql;
	}

	//note that we are intentionally not using greedy replace here, as we're targeting sqlite's dump command
	const trimmedSql = sql
		.replace("BEGIN TRANSACTION;", "")
		.replace("COMMIT;", "");
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
	return stripStringsAndComments(sql).includes("BEGIN TRANSACTION");
}

/**
 * Returns `sql` with the contents of string literals (single, double and
 * backtick quoted) and comments (`-- ...` line comments and block comments)
 * replaced by spaces. The result is only suitable for keyword detection, not for
 * execution, but it lets us search for SQL keywords without matching text that
 * lives inside string or comment content.
 */
function stripStringsAndComments(sql: string): string {
	let out = "";
	let i = 0;
	const len = sql.length;

	while (i < len) {
		const char = sql[i];

		// Line comments: -- ... up to (but not including) the end of line.
		if (char === "-" && sql[i + 1] === "-") {
			i += 2;
			while (i < len && sql[i] !== "\n") {
				i++;
			}
			continue;
		}

		// Block comments: /* ... */
		if (char === "/" && sql[i + 1] === "*") {
			i += 2;
			while (i < len && !(sql[i] === "*" && sql[i + 1] === "/")) {
				i++;
			}
			i += 2;
			continue;
		}

		// Quoted strings/identifiers. SQLite escapes the quote character by
		// doubling it (e.g. 'it''s'), so a doubled quote does not end the string.
		if (char === "'" || char === '"' || char === "`") {
			const quote = char;
			i++;
			while (i < len) {
				if (sql[i] === quote) {
					if (sql[i + 1] === quote) {
						i += 2;
						continue;
					}
					i++;
					break;
				}
				i++;
			}
			out += " ";
			continue;
		}

		out += char;
		i++;
	}

	return out;
}
