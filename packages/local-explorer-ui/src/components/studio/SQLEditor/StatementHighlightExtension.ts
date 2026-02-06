/*
This extension adds a visual highlight to the line gutter in the code editor,
indicating the currently active SQL statement.

It helps users understand which statement they’re on, especially when their
cursor is near a semicolon—clarifying whether they’re at the end of one
statement or the beginning of the next.

The highlight is also useful when selecting multiple statements, making it easier
to see which parts of the query are included in the selection.
*/

import { syntaxTree } from "@codemirror/language";
import { StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import type { EditorState, Range } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

const statementLineHighlight = Decoration.line({
	class: "cm-highlight-statement",
});

export interface StudioStatementSegment {
	from: number;
	to: number;
	text: string;
}

function toNodeString(state: EditorState, node: SyntaxNode) {
	return state.doc.sliceString(node.from, node.to);
}

/**
 * Not all SQL statements end with a semicolon. For example, CREATE TRIGGER
 * can span multiple statements but must be executed as a single unit.
 *
 * This function detects such cases by checking if the statement contains the
 * keyword BEGIN, which usually indicates a compound statement block.
 *
 * To optimize performance, we short-circuit common statements like SELECT,
 * INSERT, UPDATE, and DELETE, which do not typically include BEGIN.
 *
 * @param state - The current editor state used for extracting node content.
 * @param node - The syntax node representing the SQL statement.
 * @returns The number of BEGIN keywords found in the statement.
 */
function requiresStatementEnd(state: EditorState, node: SyntaxNode): number {
	const ptr = node.firstChild;
	if (!ptr) {
		return 0;
	}

	// Short-circuit common single-statement queries to skip BEGIN check.
	const firstKeyword = toNodeString(state, ptr).toLowerCase();
	if (firstKeyword === "select") {
		return 0;
	}
	if (firstKeyword === "insert") {
		return 0;
	}
	if (firstKeyword === "update") {
		return 0;
	}
	if (firstKeyword === "delete") {
		return 0;
	}

	const keywords = node.getChildren("Keyword");
	if (keywords.length === 0) {
		return 0;
	}

	return keywords.filter(
		(k) => toNodeString(state, k).toLowerCase() === "begin"
	).length;
}

/**
 * Checks if the given syntax node represents the exact statement `END;`.
 *
 * This is typically used to detect the termination of compound SQL blocks.
 * The function verifies that the first child is the keyword `END` (case-insensitive)
 * and that it is immediately followed by a semicolon (`;`).
 *
 * @param state - The current editor state used to extract token content.
 * @param node - The syntax node to inspect.
 * @returns True if the node matches `END;`, otherwise false.
 */
function isEndStatement(state: EditorState, node: SyntaxNode) {
	let ptr = node.firstChild;
	if (!ptr) {
		return false;
	}
	if (toNodeString(state, ptr).toLowerCase() !== "end") {
		return false;
	}

	ptr = ptr.nextSibling;
	if (!ptr) {
		return false;
	}
	if (toNodeString(state, ptr) !== ";") {
		return false;
	}

	return true;
}

/**
 * Splits the SQL query into individual statement segments.
 *
 * This function accounts for both simple and compound SQL statements.
 * Compound statements (e.g., CREATE TRIGGER ... BEGIN ... END;) are grouped together
 * to ensure they are treated as a single logical unit.
 *
 * @param state - The current editor state containing the SQL syntax tree.
 * @param generateText - If true, includes the text content of each statement segment in the result.
 * @returns An array of statement segments with their position (from, to),
 *          and optionally the text content if `generateText` is true.
 */
export function splitStudioSQLStatements(
	state: EditorState,
	generateText: boolean = true
): StudioStatementSegment[] {
	const topNode = syntaxTree(state).topNode;

	// Get all the statements
	let pendingEndCount = 0;
	const statements = topNode.getChildren("Statement");

	if (statements.length === 0) {
		return [];
	}

	const statementGroups: SyntaxNode[][] = [];
	let accumulateNodes: SyntaxNode[] = [];

	for (let i = 0; i < statements.length; i++) {
		const statement = statements[i];
		pendingEndCount += requiresStatementEnd(state, statement);

		if (pendingEndCount) {
			accumulateNodes.push(statement);
		} else {
			statementGroups.push([statement]);
		}

		if (pendingEndCount && isEndStatement(state, statement)) {
			pendingEndCount--;
			if (pendingEndCount === 0) {
				statementGroups.push(accumulateNodes);
				accumulateNodes = [];
			}
		}
	}

	if (accumulateNodes.length > 0) {
		statementGroups.push(accumulateNodes);
	}

	return statementGroups.map((r) => ({
		from: r[0].from,
		to: r[r.length - 1].to,
		text: generateText
			? state.doc.sliceString(r[0].from, r[r.length - 1].to)
			: "",
	}));
}

export function resolveStudioToNearestStatement(
	state: EditorState,
	position?: number
): { from: number; to: number } | null {
	// Breakdown and grouping the statement
	const cursor = position ?? state.selection.main.from;
	const statements = splitStudioSQLStatements(state, false);

	if (statements.length === 0) {
		return null;
	}

	// Check if our current cursor is within any statement
	let i = 0;
	for (; i < statements.length; i++) {
		const statement = statements[i];
		if (cursor < statement.from) {
			break;
		}
		if (cursor > statement.to) {
			continue;
		}
		if (cursor >= statement.from && cursor <= statement.to) {
			return statement;
		}
	}

	if (i === 0) {
		return statements[0];
	}
	if (i === statements.length) {
		return statements[i - 1];
	}

	const cursorLine = state.doc.lineAt(cursor).number;
	const topLine = state.doc.lineAt(statements[i - 1].to).number;
	const bottomLine = state.doc.lineAt(statements[i].from).number;

	if (cursorLine - topLine >= bottomLine - cursorLine) {
		return statements[i];
	} else {
		return statements[i - 1];
	}
}

function getDecorationFromState(state: EditorState) {
	const statement = resolveStudioToNearestStatement(state);
	if (!statement) {
		return Decoration.none;
	}

	// Get the line of the node
	const fromLineNumber = state.doc.lineAt(statement.from).number;
	const toLineNumber = state.doc.lineAt(statement.to).number;

	const d: Range<Decoration>[] = [];
	for (let i = fromLineNumber; i <= toLineNumber; i++) {
		d.push(statementLineHighlight.range(state.doc.line(i).from));
	}

	return Decoration.set(d);
}

const SqlStatementStateField = StateField.define({
	create(state) {
		return getDecorationFromState(state);
	},

	update(_, tr) {
		return getDecorationFromState(tr.state);
	},

	provide: (f) => EditorView.decorations.from(f),
});

const SqlStatementTheme = EditorView.baseTheme({
	".cm-highlight-statement": {
		borderLeft: "3px solid #ff9ff3 !important",
	},
});

export const StudioSQLStatementHighlightExtension = [
	SqlStatementStateField,
	SqlStatementTheme,
];
