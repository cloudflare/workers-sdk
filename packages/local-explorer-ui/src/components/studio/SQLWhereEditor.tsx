import { isDarkMode } from "@cloudflare/style-const";
import { autocompletion } from "@codemirror/autocomplete";
import { SQLDialect } from "@codemirror/lang-sql";
import { syntaxHighlighting } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import { forwardRef, useMemo } from "react";
import { StudioCodeMirror } from "./CodeMirror";
import {
	StudioSQLBaseTheme,
	StudioSQLDarkModeTheme,
	StudioSQLLightModeTheme,
} from "./SQLEditor/SQLThemePlugin";
import type {
	StudioCodeMirrorProps,
	StudioCodeMirrorReference,
} from "./CodeMirror";
import type { Extension } from "@codemirror/state";

export const StudioSQLWhereEditor = forwardRef<
	StudioCodeMirrorReference,
	SutdioSQLWhereEditor
>(function StudioSQLWhereEditor(props, ref) {
	const { columnNames, functionNames, onEnterPressed } = props;

	const whereEditorExtensions = useMemo(() => {
		const extensions: Extension[] = [
			keymap.of([
				{
					key: "Enter",
					run: () => {
						onEnterPressed?.();
						return true;
					},
				},
			]),
			SQLDialect.define({
				keywords: (
					"and or like between " +
					(functionNames ?? []).map((fn) => fn.toLocaleLowerCase()).join(" ")
				).trim(),
			}),

			// This is for syntax highlight
			syntaxHighlighting(classHighlighter),
			StudioSQLBaseTheme,
			isDarkMode() ? StudioSQLDarkModeTheme : StudioSQLLightModeTheme,
		];

		if (columnNames && columnNames.length > 0) {
			extensions.push(
				autocompletion({
					override: [
						(context) => {
							const word = context.matchBefore(/\w*/);
							if (!word || (word.from === word.to && !context.explicit)) {
								return null;
							}

							return {
								from: word.from,
								options: columnNames.map((keyword) => ({
									label: keyword,
									type: "property",
								})),
							};
						},
					],
				})
			);
		}

		return extensions;
	}, [columnNames, functionNames, onEnterPressed]);

	return (
		<StudioCodeMirror {...props} extensions={whereEditorExtensions} ref={ref} />
	);
});

interface SutdioSQLWhereEditor
	extends Omit<StudioCodeMirrorProps, "extensions"> {
	onEnterPressed?: () => void;
	columnNames?: string[];
	functionNames?: string[];
}
