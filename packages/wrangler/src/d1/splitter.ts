/**
 * @module
 * This code is inspired by that of https://www.atdatabases.org/docs/split-sql-query, which is published under MIT license,
 * and is Copyright (c) 2019 Forbes Lindesay.
 *
 * See https://github.com/ForbesLindesay/atdatabases/blob/103c1e7/packages/split-sql-query/src/index.ts
 * for the original code.
 */

import { trimSqlQuery } from "./trimmer";

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
export function splitSqlQuery(sql: string): string[] {
	const trimmedSql = trimSqlQuery(sql);
	if (!mayContainMultipleStatements(trimmedSql)) {
		return [trimmedSql];
	}
	const split = splitSqlIntoStatements(trimmedSql);
	if (split.length === 0) {
		return [trimmedSql];
	} else {
		return split;
	}
}

/**
 * Normalize structural CRLF line endings without changing quoted SQL values or
 * identifiers.
 */
export function normalizeSqlLineEndings(sql: string): string {
	let normalized = "";
	let quoteEnd: "'" | '"' | "`" | "]" | undefined;
	let inLineComment = false;
	let inBlockComment = false;

	for (let index = 0; index < sql.length; index++) {
		const char = sql[index];
		const nextChar = sql[index + 1];

		if (quoteEnd !== undefined) {
			normalized += char;
			if (char === quoteEnd) {
				if (nextChar === quoteEnd) {
					normalized += nextChar;
					index++;
				} else {
					quoteEnd = undefined;
				}
			}
			continue;
		}

		if (inLineComment) {
			if (char === "\r" && nextChar === "\n") {
				normalized += "\n";
				index++;
				inLineComment = false;
			} else {
				normalized += char;
				inLineComment = char !== "\n";
			}
			continue;
		}

		if (inBlockComment) {
			if (char === "\r" && nextChar === "\n") {
				normalized += "\n";
				index++;
			} else {
				normalized += char;
				if (char === "*" && nextChar === "/") {
					normalized += nextChar;
					index++;
					inBlockComment = false;
				}
			}
			continue;
		}

		if (char === "-" && nextChar === "-") {
			normalized += "--";
			index++;
			inLineComment = true;
			continue;
		}

		if (char === "/" && nextChar === "*") {
			normalized += "/*";
			index++;
			inBlockComment = true;
			continue;
		}

		if (char === "'" || char === '"' || char === "`") {
			normalized += char;
			quoteEnd = char;
			continue;
		}

		if (char === "[") {
			normalized += char;
			quoteEnd = "]";
			continue;
		}

		if (char === "\r" && nextChar === "\n") {
			normalized += "\n";
			index++;
			continue;
		}

		normalized += char;
	}

	return normalized;
}

function splitSqlIntoStatements(sql: string): string[] {
	const statements: string[] = [];
	let str = "";
	let word = "";
	let previousTokenWasSemicolon = false;
	let statementPrefix: string[] = [];
	let isTriggerStatement = false;
	let inTriggerBody = false;

	/**
	 * Processes the identifier token that has just ended and updates trigger state.
	 * SQLite requires every command in a trigger body to end with a semicolon, so
	 * only an `END` after a semicolon closes the trigger. CASE expressions and
	 * identifiers named BEGIN or END therefore need no special handling.
	 */
	function finishWord() {
		if (word.length === 0) {
			return;
		}

		const keyword = word.toUpperCase();
		if (!isTriggerStatement && statementPrefix.length < 3) {
			statementPrefix.push(keyword);
			isTriggerStatement =
				statementPrefix[0] === "CREATE" &&
				(statementPrefix[1] === "TRIGGER" ||
					((statementPrefix[1] === "TEMP" ||
						statementPrefix[1] === "TEMPORARY") &&
						statementPrefix[2] === "TRIGGER"));
		}

		if (isTriggerStatement && keyword === "BEGIN") {
			inTriggerBody = true;
		} else if (
			inTriggerBody &&
			keyword === "END" &&
			previousTokenWasSemicolon
		) {
			inTriggerBody = false;
		}

		previousTokenWasSemicolon = false;
		word = "";
	}

	/** Resets the parser state that is scoped to a single SQL statement. */
	function startNextStatement() {
		statementPrefix = [];
		isTriggerStatement = false;
		previousTokenWasSemicolon = false;
	}

	const iterator = sql[Symbol.iterator]();
	let next = iterator.next();
	while (!next.done) {
		const char = next.value;

		if (isIdentifierCharacter(char)) {
			str += char;
			word += char;
			next = iterator.next();
			continue;
		}

		finishWord();

		switch (char) {
			case `'`:
			case `"`:
			case "`":
				str += char + consumeUntilMarker(iterator, char);
				previousTokenWasSemicolon = false;
				break;
			case `$`: {
				const dollarQuote =
					"$" + consumeWhile(iterator, isDollarQuoteIdentifier);
				str += dollarQuote;
				if (dollarQuote.endsWith("$")) {
					str += consumeUntilMarker(iterator, dollarQuote);
				}
				previousTokenWasSemicolon = false;
				break;
			}
			case `-`:
				next = iterator.next();
				if (!next.done && next.value === "-") {
					// Skip to the end of the comment
					consumeUntilMarker(iterator, "\n");
					// Maintain the newline character
					str += "\n";
					break;
				} else {
					str += char;
					previousTokenWasSemicolon = false;
					continue;
				}
			case `/`:
				next = iterator.next();
				if (!next.done && next.value === "*") {
					// Skip to the end of the comment
					consumeUntilMarker(iterator, "*/");
					break;
				} else {
					str += char;
					previousTokenWasSemicolon = false;
					continue;
				}
			case `;`:
				if (inTriggerBody) {
					str += char;
					previousTokenWasSemicolon = true;
				} else {
					statements.push(str);
					str = "";
					startNextStatement();
				}
				break;
			default:
				str += char;
				if (!/\s/.test(char)) {
					previousTokenWasSemicolon = false;
				}
				break;
		}

		next = iterator.next();
	}
	finishWord();
	statements.push(str);

	return statements
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0);
}

/**
 * Checks whether a character can be part of an unquoted SQLite identifier.
 *
 * @param char The character to check.
 * @returns Whether the character is an identifier character.
 */
function isIdentifierCharacter(char: string) {
	return /[0-9_]/.test(char) || char.toLowerCase() !== char.toUpperCase();
}

/**
 * Pulls characters from the string iterator while the predicate remains true.
 */
function consumeWhile(
	iterator: Iterator<string>,
	predicate: (str: string) => boolean
) {
	let next = iterator.next();
	let str = "";
	while (!next.done) {
		str += next.value;
		if (!predicate(str)) {
			break;
		}
		next = iterator.next();
	}
	return str;
}

/**
 * Pulls characters from the string iterator until the `endMarker` is found.
 */
function consumeUntilMarker(iterator: Iterator<string>, endMarker: string) {
	return consumeWhile(iterator, (str) => !str.endsWith(endMarker));
}

/**
 * Returns true if the `str` ends with a dollar-quoted string marker.
 * See https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-DOLLAR-QUOTING.
 */
function isDollarQuoteIdentifier(str: string) {
	const lastChar = str.slice(-1);
	return (
		// The $ marks the end of the identifier
		lastChar !== "$" &&
		// we allow numbers, underscore and letters with diacritical marks
		(/[0-9_]/i.test(lastChar) ||
			lastChar.toLowerCase() !== lastChar.toUpperCase())
	);
}
