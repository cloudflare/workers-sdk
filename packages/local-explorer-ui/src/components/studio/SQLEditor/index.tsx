import {
	acceptCompletion,
	autocompletion,
	completionStatus,
	startCompletion,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, insertTab } from "@codemirror/commands";
import { sql } from "@codemirror/lang-sql";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { keymap, lineNumbers } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import { forwardRef, useMemo } from "react";
import { beautifySQLQuery } from "../../../utils/studio/formatter";
import { StudioCodeMirror } from "../Code/Mirror";
import { StudioSQLiteDialect } from "./SQLiteDialect";
import { createSQLTableNameHighlightPlugin } from "./SQLiteTableNameHighlightPlugin";
import { StudioSQLBaseTheme, StudioSQLTheme } from "./SQLThemePlugin";
import { StudioSQLStatementHighlightExtension } from "./StatementHighlightExtension";
import type { StudioDialect } from "../../../types/studio";
import type {
	StudioCodeMirrorProps,
	StudioCodeMirrorReference,
} from "../Code/Mirror";
import type { Extension, StateField } from "@codemirror/state";
import type { DecorationSet, KeyBinding } from "@codemirror/view";

interface StudioSQLEditorProps extends StudioCodeMirrorProps {
	autoCompleteSchema?: Record<string, string[]>;
	dialect?: StudioDialect;
	keybinding?: KeyBinding[];
	statementHighlight?: boolean;
}

/**
 * Studio SQL Editor — a CodeMirror-based editor with built-in extensions for convenience.
 * Includes language support, autocompletion, syntax highlighting, and other essentials.
 */
export const StudioSQLEditor = forwardRef<
	StudioCodeMirrorReference,
	StudioSQLEditorProps
>(function StudioSQLEditor(props, ref) {
	const {
		autoCompleteSchema,
		dialect,
		extensions,
		keybinding,
		statementHighlight,
	} = props;

	const tableNameHighlightPlugin = useMemo(() => {
		if (autoCompleteSchema) {
			return createSQLTableNameHighlightPlugin(Object.keys(autoCompleteSchema));
		}

		return createSQLTableNameHighlightPlugin([]);
	}, [autoCompleteSchema]);

	const combinedExtensions = useMemo(
		(): (Extension | StateField<DecorationSet>)[] =>
			[
				StudioSQLBaseTheme,
				StudioSQLTheme,
				lineNumbers(),
				autocompletion(),
				sql({
					dialect: StudioSQLiteDialect,
					schema: autoCompleteSchema,
				}),
				history(),
				indentUnit.of("  "),
				EditorState.tabSize.of(2),
				keymap.of([
					...(keybinding ?? []),
					{
						key: "Tab",
						preventDefault: true,
						run: (target) => {
							if (completionStatus(target.state) === "active") {
								acceptCompletion(target);
							} else {
								insertTab(target);
							}
							return true;
						},
					},
					{
						key: "Ctrl-Space",
						mac: "Cmd-i",
						preventDefault: true,
						run: startCompletion,
					},
					{
						key: "Ctrl-Shift-f",
						mac: "Shift-Cmd-f",
						preventDefault: true,
						run: (view) => {
							const { state } = view;
							const hasSelection = state.selection.ranges.some((r) => !r.empty);
							try {
								if (hasSelection) {
									const changes = state.selection.ranges
										.map(({ from, to }) => {
											if (from === to) {
												return null;
											}
											const source = state.doc.sliceString(from, to);
											const formatted = beautifySQLQuery(
												source,
												dialect ?? "sqlite"
											);
											return { from, to, insert: formatted };
										})
										.filter(Boolean) as {
										from: number;
										to: number;
										insert: string;
									}[];
									if (changes.length > 0) {
										view.dispatch({ changes });
									}
								} else {
									const full = state.doc.toString();
									const formatted = beautifySQLQuery(full, dialect ?? "sqlite");
									view.dispatch({
										changes: {
											from: 0,
											to: state.doc.length,
											insert: formatted,
										},
									});
								}
							} catch {
								// Beautify failed; do nothing to avoid disrupting the user.
							}
							return true;
						},
					},
					...defaultKeymap,
				]),
				tableNameHighlightPlugin,
				syntaxHighlighting(classHighlighter),
				statementHighlight ? StudioSQLStatementHighlightExtension : undefined,
				...(extensions ?? []),
			].filter(Boolean) as (Extension | StateField<DecorationSet>)[],
		[
			autoCompleteSchema,
			dialect,
			extensions,
			keybinding,
			statementHighlight,
			tableNameHighlightPlugin,
		]
	);

	return (
		<StudioCodeMirror {...props} extensions={combinedExtensions} ref={ref} />
	);
});
