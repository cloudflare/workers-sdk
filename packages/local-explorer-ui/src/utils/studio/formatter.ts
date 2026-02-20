// A lightweight, rule-based SQL formatter built with a stack approach.
// It’s intentionally small and limited in scope.
// For broader functionality, consider switching to a full library such as sql-formatter.

import { sqliteBuiltinFunctionList } from "../../components/studio/SQLEditor/SQLite/Dialect";
import { tokenizeSQL } from "./sql";
import type { StudioDialect, StudioSQLToken } from "../../types/studio";

type IndentFrame =
	| "SELECT"
	| "WHERE"
	| "JOIN"
	| "SET"
	| "LPAREN"
	| "LPAREN-INLINE";

type IndentFrames = IndentFrame[];

/**
 * Formats a list of SQL tokens by applying indentation and newlines based on SQL syntax rules.
 *
 * @param tokens - The array of SQL tokens to format (whitespace tokens should be pre-filtered).
 * @param functionList - A list of known SQL function names to handle function call formatting.
 *
 * @returns A new array of tokens with appropriate whitespace tokens inserted for formatting.
 */
function formatInternal(
	tokens: StudioSQLToken[],
	functionList: string[]
): StudioSQLToken[] {
	const functionSet = new Set(functionList.map((f) => f.toUpperCase()));
	const result = new Array<StudioSQLToken>();

	let indentStack = new Array<IndentFrame>();
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i] as StudioSQLToken;
		const previousToken = i > 0 ? tokens[i - 1] : undefined;
		const normalizedToken = token.value.toUpperCase();

		// Keep comments isolated on their own lines
		if (token.type === "COMMENT") {
			if (needsSpace(result)) {
				pushNewline(result, indentStack);
			}

			result.push(token);
			pushNewline(result, indentStack);

			continue;
		}

		// Clause header that requires indentation after
		if (["SELECT", "SET", "WHERE"].includes(normalizedToken)) {
			while (["SET", "JOIN"].includes(peek(indentStack) ?? "")) {
				indentStack.pop();
			}

			if (needsSpace(result)) {
				pushNewline(result, indentStack);
			}

			result.push(token);
			indentStack.push(normalizedToken as IndentFrames[number]);

			pushNewline(result, indentStack);
			continue;
		}

		// Join clause header
		if (["INNER", "LEFT", "RIGHT"].includes(normalizedToken)) {
			if (peek(indentStack) !== "JOIN") {
				indentStack.push("JOIN");
			}

			pushNewline(result, indentStack);
			result.push(token);
			continue;
		}

		if (normalizedToken === "FROM") {
			if (peek(indentStack) === "SELECT") {
				indentStack.pop();
			}
			pushNewline(result, indentStack);
			result.push(token);
			continue;
		}

		// Clause header that does not push indentation
		if (
			["VALUES", "ORDER", "GROUP", "LIMIT", "OFFSET", "HAVING"].includes(
				normalizedToken
			)
		) {
			if (["SET", "WHERE"].includes(peek(indentStack) ?? "")) {
				indentStack.pop();
			}

			pushNewline(result, indentStack);
			result.push(token);
			continue;
		}

		if (["AND", "OR"].includes(normalizedToken)) {
			if (peek(indentStack) !== "LPAREN-INLINE") {
				pushNewline(result, indentStack);
			}

			result.push(token);
			continue;
		}

		// Commas will add new line unless it is in inline-paren
		if (normalizedToken === ",") {
			result.push(token);
			if (peek(indentStack) !== "LPAREN-INLINE") {
				pushNewline(result, indentStack);
			}

			continue;
		}

		if (normalizedToken === "(") {
			let shouldNestedIndent = true;

			const isFunctionCalled =
				previousToken?.type === "IDENTIFIER" &&
				functionSet.has(previousToken?.value.toUpperCase());

			if (
				isFunctionCalled ||
				lookBehindValue(tokens, i, 2) === "INTO" ||
				lookBehindValue(tokens, i) === "VALUES"
			) {
				shouldNestedIndent = false;
			}

			if (
				["TABLE"].includes(
					(lookBehind(tokens, i, 2)?.value ?? "").toUpperCase()
				) &&
				lookBehind(tokens, i)?.type === "IDENTIFIER"
			) {
				shouldNestedIndent = true;
			}

			// We add extra space if needed, but if it is identifier it might be a function call
			if (needsSpace(result) && !isFunctionCalled) {
				result.push({ type: "WHITESPACE", value: " " });
			}

			indentStack.push(shouldNestedIndent ? "LPAREN" : "LPAREN-INLINE");
			result.push(token);

			if (shouldNestedIndent) {
				pushNewline(result, indentStack);
			}

			continue;
		}

		if (normalizedToken === ")") {
			while (
				indentStack.length > 0 &&
				!["LPAREN", "LPAREN-INLINE"].includes(peek(indentStack) ?? "")
			) {
				indentStack.pop();
			}

			if (peek(indentStack) === "LPAREN") {
				indentStack.pop();
				pushNewline(result, indentStack);
			} else if (peek(indentStack) === "LPAREN-INLINE") {
				indentStack.pop();
			}

			result.push(token);
			continue;
		}

		if (normalizedToken === ";") {
			result.push(token);
			indentStack = [];
			pushNewline(result, indentStack);
			pushNewline(result, indentStack);
			continue;
		}

		if ([",", "."].includes(normalizedToken)) {
			result.push(token);
			continue;
		}

		if (needsSpace(result)) {
			result.push({ type: "WHITESPACE", value: " " });
		}

		result.push(token);
	}

	return result;
}

/**
 * Peeks at an element from the end of the array without removing it.
 *
 * @param arr - The array to peek into.
 * @param previous - How many positions from the end to look (1 = top/last element).
 *
 * @returns The element at the specified position from the end, or undefined if out of bounds.
 */
function peek<T>(arr: T[], previous = 1): T | undefined {
	return arr.length - previous >= 0 ? arr[arr.length - previous] : undefined;
}

/**
 * Emit a newline + indentation proportional to block scopes.
 *
 * LPAREN-INLINE does not contribute to indentation depth.
 *
 * @param result
 * @param indentStack
 */
function pushNewline(
	result: StudioSQLToken[],
	indentStack: IndentFrames
): void {
	const depth = indentStack.reduce((acc, i) => {
		if (i === "LPAREN-INLINE") {
			return acc;
		}

		return acc + 1;
	}, 0);

	const indentValue = "  ";
	result.push({
		type: "WHITESPACE",
		value: "\n" + indentValue.repeat(depth),
	});
}

/**
 * Retrieves a token from a previous position in the token array.
 *
 * @param tokens - The array of SQL tokens.
 * @param i - The current index in the token array.
 * @param previousTokenCount - How many tokens back to look (defaults to 1).
 *
 * @returns The token at the specified previous position, or undefined if out of bounds.
 */
function lookBehind(
	tokens: StudioSQLToken[],
	i: number,
	previousTokenCount = 1
): StudioSQLToken | undefined {
	const offset = i - previousTokenCount;
	if (i - previousTokenCount < 0) {
		return;
	}

	return tokens[offset];
}

/**
 * Retrieves the uppercase value of a token from a previous position in the token array.
 *
 * @param tokens - The array of SQL tokens.
 * @param i - The current index in the token array.
 * @param previousTokenCount - How many tokens back to look (defaults to 1).
 *
 * @returns The uppercase value of the token at the specified position, or an empty string if out of bounds.
 */
function lookBehindValue(
	tokens: StudioSQLToken[],
	i: number,
	previousTokenCount = 1
): string {
	return (lookBehind(tokens, i, previousTokenCount)?.value ?? "").toUpperCase();
}

/**
 * Determines if a space token should be inserted before the next token.
 *
 * Returns false if the result is empty, the last token is whitespace, or the
 * last token is a character that shouldn't be followed by a space (`.` or `(`).
 *
 * @param result - The array of tokens built so far during formatting.
 *
 * @returns True if a space should be inserted before the next token, false otherwise.
 */
function needsSpace(result: StudioSQLToken[]): boolean {
	if (result.length === 0) {
		return false;
	}

	const last = result[result.length - 1] as StudioSQLToken;
	if (last.type === "WHITESPACE") {
		return false;
	}

	if (last.value === ".") {
		return false;
	}

	if (last.value === "(") {
		return false;
	}

	return true;
}

/**
 * Formats a SQL statement with proper indentation and line breaks.
 *
 * After formatting, the function verifies that the formatted output is semantically
 * equivalent to the original by comparing tokens. Throws an error if formatting
 * would alter the query structure.
 *
 * @param statement - The raw SQL statement to format.
 * @param _dialect - The SQL dialect (currently only SQLite is supported).
 *
 * @returns The formatted SQL string with proper indentation and newlines.
 *
 * @throws Error if formatting would alter the query's token structure.
 */
export function beautifySQLQuery(statement: string, _dialect: StudioDialect) {
	// Split the token and remove the whietspace
	const tokens = tokenizeSQL(statement, "sqlite").filter(
		(token) => token.type !== "WHITESPACE"
	);

	const result = formatInternal(tokens, sqliteBuiltinFunctionList)
		.map((token) => token.value)
		.join("")
		.trim();

	// Verify that formatting preserves the original query semantics.
	// We re-tokenize the formatted SQL and compare against the original tokens.
	// If the token count or any token value differs, we throw an error.
	// This ensures it's safer to fail formatting than to risk altering the query.
	const verifyTokens = tokenizeSQL(result, "sqlite").filter(
		(token) => token.type !== "WHITESPACE"
	);

	if (verifyTokens.length !== tokens.length) {
		throw new Error("Fail to format the query");
	}

	for (let i = 0; i < verifyTokens.length; i++) {
		// Loop bounds guarantee index is valid; lengths are equal (checked above)
		const original = tokens[i] as StudioSQLToken;
		const formatted = verifyTokens[i] as StudioSQLToken;
		if (original.value !== formatted.value) {
			throw new Error(
				`Fail to format the query at token #${i}: "${original.value}" -> "${formatted.value}"`
			);
		}
	}

	return result;
}

/**
 * Extracts the table name from a simple SQL statement following the FROM keyword.
 * Not reliable for complex queries - used only for query tab display names.
 *
 * @param sql - The SQL statement to parse
 *
 * @returns The table name if found, otherwise an empty string
 */
export function getStudioTableNameFromSQL(sql: string): string {
	try {
		const tokens = tokenizeSQL(sql, "sqlite").filter(
			(token) => token.type !== "WHITESPACE"
		);

		const fromIndex = tokens.findIndex(
			(token) => token.value.toUpperCase() === "FROM"
		);
		if (fromIndex === -1) {
			return "";
		}

		const tableName = tokens[fromIndex + 1];
		if (!tableName || tableName.type !== "IDENTIFIER") {
			return "";
		}

		return tableName.value;
	} catch {
		return "";
	}
}
