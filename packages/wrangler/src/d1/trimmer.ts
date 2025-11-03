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
			"Wrangler could not process the provided SQL file, as it contains several transactions.\nD1 runs your SQL in a transaction for you.\nPlease export an SQL file from your SQLite database and try again."
		);
	}

	return trimmedSql;
}

// sqlite may start an sql dump file with pragmas,
// so we can't just use sql.startsWith here.
export function mayContainTransaction(sql: string): boolean {
	return sql.includes("BEGIN TRANSACTION");
}
