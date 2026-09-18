import { trimSqlQuery } from "./trimmer";

// Port of SQLite's sqlite3_complete() scanner: https://github.com/sqlite/sqlite/blob/version-3.44.2/src/complete.c

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
	let start = 0;
	while (start < sql.length) {
		const end = findCompleteStatementEnd(sql, start);
		if (end === undefined) {
			break;
		}
		const statement = sql.slice(start, end - 1).trim();
		if (statement.length > 0) {
			statements.push(statement);
		}
		start = end;
	}

	const remainder = sql.slice(start).trim();
	if (remainder.length > 0) {
		statements.push(remainder);
	}
	return statements;
}

type Token =
	| "tkSEMI"
	| "tkWS"
	| "tkOTHER"
	| "tkEXPLAIN"
	| "tkCREATE"
	| "tkTEMP"
	| "tkTRIGGER"
	| "tkEND";

type State =
	| "INVALID"
	| "START"
	| "NORMAL"
	| "EXPLAIN"
	| "CREATE"
	| "TRIGGER"
	| "SEMI"
	| "END";

// Port of SQLite's trans[8][8] transition table.
const transitions: Record<State, Record<Token, State>> = {
	INVALID: {
		tkSEMI: "START",
		tkWS: "INVALID",
		tkOTHER: "NORMAL",
		tkEXPLAIN: "EXPLAIN",
		tkCREATE: "CREATE",
		tkTEMP: "NORMAL",
		tkTRIGGER: "NORMAL",
		tkEND: "NORMAL",
	},
	START: {
		tkSEMI: "START",
		tkWS: "START",
		tkOTHER: "NORMAL",
		tkEXPLAIN: "EXPLAIN",
		tkCREATE: "CREATE",
		tkTEMP: "NORMAL",
		tkTRIGGER: "NORMAL",
		tkEND: "NORMAL",
	},
	NORMAL: {
		tkSEMI: "START",
		tkWS: "NORMAL",
		tkOTHER: "NORMAL",
		tkEXPLAIN: "NORMAL",
		tkCREATE: "NORMAL",
		tkTEMP: "NORMAL",
		tkTRIGGER: "NORMAL",
		tkEND: "NORMAL",
	},
	EXPLAIN: {
		tkSEMI: "START",
		tkWS: "EXPLAIN",
		tkOTHER: "EXPLAIN",
		tkEXPLAIN: "NORMAL",
		tkCREATE: "CREATE",
		tkTEMP: "NORMAL",
		tkTRIGGER: "NORMAL",
		tkEND: "NORMAL",
	},
	CREATE: {
		tkSEMI: "START",
		tkWS: "CREATE",
		tkOTHER: "NORMAL",
		tkEXPLAIN: "NORMAL",
		tkCREATE: "NORMAL",
		tkTEMP: "CREATE",
		tkTRIGGER: "TRIGGER",
		tkEND: "NORMAL",
	},
	TRIGGER: {
		tkSEMI: "SEMI",
		tkWS: "TRIGGER",
		tkOTHER: "TRIGGER",
		tkEXPLAIN: "TRIGGER",
		tkCREATE: "TRIGGER",
		tkTEMP: "TRIGGER",
		tkTRIGGER: "TRIGGER",
		tkEND: "TRIGGER",
	},
	SEMI: {
		tkSEMI: "SEMI",
		tkWS: "SEMI",
		tkOTHER: "TRIGGER",
		tkEXPLAIN: "TRIGGER",
		tkCREATE: "TRIGGER",
		tkTEMP: "TRIGGER",
		tkTRIGGER: "TRIGGER",
		tkEND: "END",
	},
	END: {
		tkSEMI: "START",
		tkWS: "END",
		tkOTHER: "TRIGGER",
		tkEXPLAIN: "TRIGGER",
		tkCREATE: "TRIGGER",
		tkTEMP: "TRIGGER",
		tkTRIGGER: "TRIGGER",
		tkEND: "TRIGGER",
	},
};

function findCompleteStatementEnd(
	sql: string,
	start: number
): number | undefined {
	let state: State = "INVALID";
	for (let index = start; index < sql.length; index++) {
		const char = sql[index];
		let token: Token;
		if (char === ";") {
			token = "tkSEMI";
		} else if (
			char === " " ||
			char === "\r" ||
			char === "\t" ||
			char === "\n" ||
			char === "\f"
		) {
			token = "tkWS";
		} else if (char === "/" && sql[index + 1] === "*") {
			const end = sql.indexOf("*/", index + 2);
			if (end === -1) {
				return undefined;
			}
			index = end + 1;
			token = "tkWS";
		} else if (char === "-" && sql[index + 1] === "-") {
			const end = sql.indexOf("\n", index + 2);
			if (end === -1) {
				return undefined;
			}
			index = end;
			token = "tkWS";
		} else if (char === "[") {
			const end = sql.indexOf("]", index + 1);
			if (end === -1) {
				return undefined;
			}
			index = end;
			token = "tkOTHER";
		} else if (char === "'" || char === '"' || char === "`") {
			const end = sql.indexOf(char, index + 1);
			if (end === -1) {
				return undefined;
			}
			index = end;
			token = "tkOTHER";
		} else if (isIdentifierChar(char)) {
			const identifierStart = index;
			while (index + 1 < sql.length && isIdentifierChar(sql[index + 1])) {
				index++;
			}
			token = classifyIdentifier(sql.slice(identifierStart, index + 1));
		} else {
			token = "tkOTHER";
		}

		state = getNextState(state, token);
		if (state === "START") {
			return index + 1;
		}
	}
	return undefined;
}

function getNextState(state: State, token: Token): State {
	return transitions[state][token];
}

function isIdentifierChar(char: string): boolean {
	return /[A-Za-z0-9_$\u0080-\uffff]/.test(char);
}

function classifyIdentifier(identifier: string): Token {
	switch (identifier.toLowerCase()) {
		case "explain":
			return "tkEXPLAIN";
		case "create":
			return "tkCREATE";
		case "temp":
		case "temporary":
			return "tkTEMP";
		case "trigger":
			return "tkTRIGGER";
		case "end":
			return "tkEND";
		default:
			return "tkOTHER";
	}
}
