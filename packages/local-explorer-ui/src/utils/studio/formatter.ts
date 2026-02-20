// A lightweight, rule-based SQL formatter built with a stack approach.
// It’s intentionally small and limited in scope.
// For broader functionality, consider switching to a full library such as sql-formatter.

import { tokenizeSQL } from "./sql";

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
