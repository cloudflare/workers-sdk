/**
 * @module
 * This code is inspired by that of https://www.atdatabases.org/docs/split-sql-query, which is published under MIT license,
 * and is Copyright (c) 2019 Forbes Lindesay.
 *
 * See https://github.com/ForbesLindesay/atdatabases/blob/103c1e7/packages/split-sql-query/src/index.ts
 * for the original code.
 */

/**
 * Is the given `sql` string likely to contain multiple statements.
 *
 * If `mayContainMultipleStatements()` returns `false` you can be confident that the sql
 * does not contain multiple statements. Otherwise you have to check further.
 */
export function mayContainMultipleStatements(sql: string): boolean {
	const trimmed = sql.trimEnd();
	const semiColonIndex = trimmed.indexOf(";");
	return semiColonIndex !== -1 && semiColonIndex !== trimmed.length - 1;
}

/**
 * Split an SQLQuery into an array of statements
 */

export default function splitSqlQuery(sql: string): string[] {
	if (!mayContainMultipleStatements(sql)) return [sql];
	const split = splitSqlIntoStatements(sql);
	if (split.length === 0) {
		return [sql];
	} else {
		return split;
	}
}

function splitSqlIntoStatements(sql: string): string[] {
	const statements: string[] = [];

	// Use a regex pattern to match the end of each statement
	const pattern = /(?<!['"`$a-zA-Z0-9])\s*;\s*(?!['"`$a-zA-Z0-9])/g;
	const matches = [...sql.matchAll(pattern)];

	let lastIndex = 0;
	matches.forEach((match) => {
		if (match.index !== undefined) {
			// Add each statement to the statements array
			const statement = sql.slice(lastIndex, match.index).trim();
			if (statement.length > 0) {
				statements.push(statement);
			}
			lastIndex = match.index + match[0].length;
		}
	});

	// Add the remaining statement, if any
	const lastStatement = sql.slice(lastIndex).trim();
	if (lastStatement.length > 0) {
		statements.push(lastStatement);
	}

	return statements;
}
