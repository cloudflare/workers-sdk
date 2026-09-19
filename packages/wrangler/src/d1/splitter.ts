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
	const compoundStatementStack: ((s: string) => boolean)[] = [];

	const iterator = sql[Symbol.iterator]();
	let next = iterator.next();
	while (!next.done) {
		const char = next.value;

		if (compoundStatementStack[0]?.(str + char)) {
			compoundStatementStack.shift();
		}

		switch (char) {
			case `'`:
			case `"`:
			case "`":
				str += char + consumeUntilMarker(iterator, char);
				break;
			case `$`: {
				const dollarQuote =
					"$" + consumeWhile(iterator, isDollarQuoteIdentifier);
				str += dollarQuote;
				if (dollarQuote.endsWith("$")) {
					str += consumeUntilMarker(iterator, dollarQuote);
				}
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
					continue;
				}
			case `;`:
				if (compoundStatementStack.length === 0) {
					statements.push(str);
					str = "";
				} else {
					str += char;
				}
				break;
			default:
				str += char;
				break;
		}

		if (isCompoundStatementStart(str)) {
			compoundStatementStack.unshift(isCompoundStatementEnd);
		}

		next = iterator.next();
	}
	statements.push(str);

	return statements
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0);
}

/**
 * Pulls characters from the string iterator while the predicate remains true.
 * Only the bounded trailing window is passed to the predicate.
 */
function consumeWhile(
	iterator: Iterator<string>,
	predicate: (str: string) => boolean,
	window: number = 16
) {
	let next = iterator.next();
	let str = "";
	let tail = "";
	while (!next.done) {
		str += next.value;
		tail = (tail + next.value).slice(-window);
		if (!predicate(tail)) {
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
	return consumeWhile(
		iterator,
		(str) => !str.endsWith(endMarker),
		endMarker.length
	);
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

/**
 * A character SQLite allows inside an unquoted identifier: ASCII letters,
 * digits, underscore, `$`, and -- for its permissive Unicode support --
 * every code point at or above U+0080. Anything else is a valid boundary
 * between an identifier and a keyword like `BEGIN`/`CASE`/`END`.
 *
 * Used as the negated boundary class in both `isCompoundStatementStart()`
 * and `isCompoundStatementEnd()` so the two can't drift out of sync again --
 * that exact drift (one broadened, the other left narrow) is what caused
 * the `(CASE ... END)` regression these functions' history describes below.
 * Without this, an identifier like `foo$CASE` or `ENDα` is misread as the
 * keyword, corrupting the compound-statement nesting for the rest of the
 * file.
 */
const SQL_IDENTIFIER_CHAR = "A-Za-z0-9_$\\u0080-\\uffff";

/**
 * A valid boundary between an identifier and a `BEGIN`/`CASE`/`END` keyword:
 * any non-identifier character, *except* `.`. SQLite's qualifier operator
 * (`table.column`, `new.begin`) always introduces an identifier reference on
 * its right-hand side, never a real keyword, even when that identifier's
 * name happens to spell `begin`/`case`/`end` -- so a `.` must not itself
 * count as a keyword boundary, or a qualified column literally named
 * begin/case/end (`new.begin`, `t.end`) is misread as opening or closing a
 * compound statement.
 */
const SQL_STATEMENT_BOUNDARY = `[^${SQL_IDENTIFIER_CHAR}.]`;

// Compiled once at module load, not per call: isCompoundStatementStart() runs
// on every character of the input in splitSqlIntoStatements()'s main loop, so
// constructing a `new RegExp` inside the function would recompile it once per
// character of the whole file.
//
// Both the leading boundary (SQL_STATEMENT_BOUNDARY, excluding `.`) and the
// trailing boundary (any non-identifier character, `.` included -- nothing
// meaningful can follow BEGIN/CASE/END with a `.`, so there's no equivalent
// false-positive risk on that side) are shared between both regexes so they
// can't drift out of sync again. That exact drift -- one side broadened,
// the other left narrow -- is what caused every regression in this
// function's history: first between start and end, then between the
// required-whitespace and any-non-identifier-character forms of each.
const COMPOUND_STATEMENT_START_RE = new RegExp(
	`${SQL_STATEMENT_BOUNDARY}(BEGIN|CASE)[^${SQL_IDENTIFIER_CHAR}]$`,
	"i"
);
const COMPOUND_STATEMENT_END_RE = new RegExp(
	`${SQL_STATEMENT_BOUNDARY}END[^${SQL_IDENTIFIER_CHAR}]$`,
	"i"
);

/**
 * Returns true if the `str` ends with a compound statement `BEGIN` or `CASE` marker.
 *
 * Neither the character immediately before nor after `BEGIN`/`CASE` needs to
 * be whitespace specifically -- any valid statement boundary works on both
 * sides. A `(CASE ... END)` used as a parenthesised value expression is
 * preceded directly by `(`, not whitespace, and `CASE(expr)` (SQLite allows
 * a value expression immediately after `CASE` with no space) is followed
 * directly by `(`. Requiring whitespace on either side meant such a
 * `CASE`'s start went undetected, while its `END` -- once end-detection was
 * broadened to accept a trailing `)`/`,` -- was. That asymmetry let an
 * unrelated, already-open compound statement's own end marker (e.g. an
 * enclosing trigger's `BEGIN ... END`) get closed prematurely by the inner
 * CASE's `END)`, which the stack had never actually been pushed for.
 */
function isCompoundStatementStart(str: string) {
	return COMPOUND_STATEMENT_START_RE.test(str);
}

/**
 * Returns true if the `str` ends with a compound statement `END` marker.
 *
 * Neither the character immediately before nor after `END` needs to be
 * whitespace specifically: a `CASE ... END` used as a value expression
 * (e.g. `SET x = CASE ... END, y = 1`) is legitimately followed by a comma
 * or closing paren rather than `;`/whitespace, and a compactly-formatted
 * expression (e.g. `THEN 1 ELSE(0)END`) can precede `END` with a closing
 * paren and no space at all. Requiring whitespace before `END` meant that
 * compact form went undetected entirely -- not just "not split", but
 * actively wrong: the stack frame it should have popped stayed open, so a
 * later, unrelated `END` (e.g. an enclosing trigger's own) popped it
 * instead, silently merging every statement in between into one.
 */
function isCompoundStatementEnd(str: string) {
	return COMPOUND_STATEMENT_END_RE.test(str);
}
