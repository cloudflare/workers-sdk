import type { StudioDialect, StudioSQLToken } from "../../types/studio";

const TOKEN_WHITESPACE = /^\s+/;
const TOKEN_IDENTIFIER =
	/^(`([^`\n]|``)+`|"([^"\n]|"")+"|\[[^\]\n]+\]|[a-zA-Z_][a-zA-Z0-9_]*)/;
const TOKEN_STRING_LITERAL = /^(?:'(?:[^'\n]|'')*'|"(?:[^"\n]|"")*")/;
const TOKEN_NUMBER_LITERAL = /^\d+(\.\d+)?/;
const TOKEN_PLACEHOLDER = /^:[a-zA-Z_][a-zA-Z0-9_]*/;

const TOKEN_COMMENT = /^(--.*|\/\*[\s\S]*?\*\/)/; // Supporting -- and /* comments */

const TOKEN_OPERATOR = /^(::|<>|!=|<=|>=|=|<|>|\+|-|\*|\/)/;
const TOKEN_PUNCTUATION = /^[`,;().]/;

/**
 * Definitions for each SQL token type, with matching logic.
 * Each rule tries to match from the start of the remaining SQL string.
 * IMPORTANT: Order matters and the first matching token will be used
 */
const TOKEN_DEFINITIONS = [
	{
		matchToken: (input) => TOKEN_WHITESPACE.exec(input)?.[0] ?? null,
		type: "WHITESPACE",
	},
	{
		matchToken: (input) => TOKEN_IDENTIFIER.exec(input)?.[0] ?? null,
		type: "IDENTIFIER",
	},
	{
		matchToken: (input) => TOKEN_STRING_LITERAL.exec(input)?.[0] ?? null,
		type: "STRING",
	},

	{
		matchToken: (input) => TOKEN_NUMBER_LITERAL.exec(input)?.[0] ?? null,
		type: "NUMBER",
	},
	{
		matchToken: (input) => TOKEN_PLACEHOLDER.exec(input)?.[0] ?? null,
		type: "PLACEHOLDER",
	},
	{
		matchToken: (input) => TOKEN_COMMENT.exec(input)?.[0] ?? null,
		type: "COMMENT",
	},
	{
		matchToken: (input) => TOKEN_OPERATOR.exec(input)?.[0] ?? null,
		type: "OPERATOR",
	},
	{
		matchToken: (input) => TOKEN_PUNCTUATION.exec(input)?.[0] ?? null,
		type: "PUNCTUATION",
	},
] satisfies {
	matchToken: (input: string, dialect?: StudioDialect) => string | null;
	type: StudioSQLToken["type"];
}[];

/**
 * Tokenizes a SQL statement into an array of tokens.
 *
 * This function breaks down a raw SQL string into meaningful parts such as
 * keywords, identifiers, strings, operators, symbols, and comments.
 * It does not perform full SQL parsing, but provides enough structure
 * for simple analysis, syntax highlighting, or building a custom parser.
 *
 * @param sql - The SQL statement to tokenize
 * @param dialect - The studio dialect type
 *
 * @returns A list of SQL tokens
 */

export function tokenizeSQL(
	sql: string,
	_dialect: StudioDialect
): StudioSQLToken[] {
	try {
		const tokens = new Array<StudioSQLToken>();
		const length = sql.length;

		let cursor = 0;
		let accumulateUnknown = "";
		while (cursor < length) {
			let matched = false;

			// This creates a new substring on each loop iteration.
			// Performance could be improved by passing the original string with an offset,
			// but JavaScript RegExp does not support matching from a specific index.
			// For now, this approach is simple and fast enough for our use case.
			const remainingSQL = sql.substring(cursor);

			for (const { type, matchToken } of TOKEN_DEFINITIONS) {
				const match = matchToken(remainingSQL);
				if (match) {
					if (accumulateUnknown !== "") {
						tokens.push({ type: "UNKNOWN", value: accumulateUnknown });
						accumulateUnknown = "";
					}

					tokens.push({ type, value: match });
					cursor += match.length;
					matched = true;
					break;
				}
			}

			if (!matched) {
				accumulateUnknown += remainingSQL[0];
				cursor++;
			}
		}

		if (accumulateUnknown !== "") {
			tokens.push({ type: "UNKNOWN", value: accumulateUnknown });
		}

		return tokens;
	} catch {
		return [
			{
				type: "SQL",
				value: sql,
			},
		];
	}
}
