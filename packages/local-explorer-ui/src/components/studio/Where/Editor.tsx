import { autocompletion } from "@codemirror/autocomplete";
import { SQLDialect } from "@codemirror/lang-sql";
import { syntaxHighlighting } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import { forwardRef, useMemo } from "react";
import { StudioCodeMirror } from "../Code/Mirror";
import {
	StudioSQLBaseTheme,
	StudioSQLTheme,
} from "../SQLEditor/SQLThemePlugin";
import type {
	StudioCodeMirrorProps,
	StudioCodeMirrorReference,
} from "../Code/Mirror";
import type { Extension } from "@codemirror/state";

interface SutdioSQLWhereEditor
	extends Omit<StudioCodeMirrorProps, "extensions"> {
	columnNames?: string[];
	functionNames?: string[];
	onEnterPressed?: () => void;
}

export const StudioSQLWhereEditor = forwardRef<
	StudioCodeMirrorReference,
	SutdioSQLWhereEditor
>(function StudioSQLWhereEditor(props, ref) {
	const { columnNames, functionNames, onEnterPressed } = props;

	const whereEditorExtensions = useMemo((): Extension[] => {
		const extensions = [
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
			StudioSQLTheme,
		] satisfies Extension[];

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
