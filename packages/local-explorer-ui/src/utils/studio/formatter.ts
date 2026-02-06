// A lightweight, rule-based SQL formatter built with a stack approach.
// It’s intentionally small and limited in scope.
// For broader functionality, consider switching to a full library such as sql-formatter.

import { sqliteBuiltinFunctionList } from "../../components/Studio/SQLEditor/SQLiteDialect";
import { waeBuiltinFunctionList } from "../../components/Studio/SQLEditor/WAEDialect";
import { tokenizeSQL } from "./index";
import type { StudioDialect, StudioSQLToken } from "../../types/studio";

export function beautifySQLQuery(statement: string, dialect: StudioDialect) {
	// Split the token and remove the whietspace
	const tokens = tokenizeSQL(statement, "sqlite").filter(
		(token) => token.type !== "WHITESPACE"
	);

	const result = formatInternal(
		tokens,
		dialect === "sqlite" ? sqliteBuiltinFunctionList : waeBuiltinFunctionList
	)
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
		if (tokens[i].value !== verifyTokens[i].value) {
			throw new Error(
				`Fail to format the query at token #${i}: "${tokens[i].value}" -> "${verifyTokens[i].value}"`
			);
		}
	}

	return result;
}

type IndentFrame = (
	| "SELECT"
	| "WHERE"
	| "JOIN"
	| "SET"
	| "LPAREN"
	| "LPAREN-INLINE"
)[];

function formatInternal(
	tokens: StudioSQLToken[],
	functionList: string[]
): StudioSQLToken[] {
	const result: StudioSQLToken[] = [];
	const functionSet = new Set(functionList.map((f) => f.toUpperCase()));

	let indentStack: IndentFrame = [];

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
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
			indentStack.push(normalizedToken as IndentFrame[number]);

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

// Peek top of stack; previous defaults to 1 (top)
function peek<T>(arr: T[], previous = 1) {
	return arr.length - previous >= 0 ? arr[arr.length - previous] : undefined;
}

/**
 * Emit a newline + indentation proportional to block scopes.
 * LPAREN-INLINE does not contribute to indentation depth.
 */
function pushNewline(result: StudioSQLToken[], indentStack: IndentFrame) {
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

function lookBehind(
	tokens: StudioSQLToken[],
	i: number,
	previousTokenCount = 1
) {
	const offset = i - previousTokenCount;
	if (i - previousTokenCount < 0) {
		return;
	}
	return tokens[offset];
}

function lookBehindValue(
	tokens: StudioSQLToken[],
	i: number,
	previousTokenCount = 1
) {
	return (lookBehind(tokens, i, previousTokenCount)?.value ?? "").toUpperCase();
}

function needsSpace(result: StudioSQLToken[]) {
	if (result.length === 0) {
		return false;
	}
	if (result[result.length - 1].type === "WHITESPACE") {
		return false;
	}
	if (result[result.length - 1].value === ".") {
		return false;
	}
	if (result[result.length - 1].value === "(") {
		return false;
	}
	return true;
}

/**
 * Extracts the table name from a simple SQL statement following the FROM keyword.
 * Not reliable for complex queries - used only for query tab display names.
 *
 * @param sql - The SQL statement to parse
 * @returns The table name if found, otherwise an empty string
 */
export function getStudioTableNameFromSQL(sql: string) {
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

		if (tableName.type !== "IDENTIFIER") {
			return "";
		}
		return tableName.value;
	} catch {
		return "";
	}
}
