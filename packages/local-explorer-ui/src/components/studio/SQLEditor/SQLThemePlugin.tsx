import { EditorView } from "@codemirror/view";

export const StudioSQLBaseTheme = EditorView.baseTheme({
	"&": {
		height: "100%",
		minHeight: "100%",
	},
	"&.cm-editor": {
		fontSize: "14px",
	},
	"&.cm-focused": {
		outline: "none !important",
	},
	".cm-scroller": {
		outline: "none",
	},
	"& .cm-line": {
		borderLeft: "3px solid transparent",
		paddingLeft: "10px",
	},
	".cm-completionIcon-property::after": {
		content: '"🧱" !important',
	},
});

export const StudioSQLTheme = EditorView.baseTheme({
	".cm-content": {
		caretColor: "var(--studio-editor-caret)",
	},

	"&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
		backgroundColor: "var(--studio-editor-selection) !important",
	},

	".cm-activeLine": {
		backgroundColor: "var(--studio-editor-active-line)",
	},
	".cm-activeLineGutter": {
		backgroundColor: "var(--studio-editor-active-line)",
	},

	".tok-keyword": {
		color: "var(--studio-syntax-keyword)",
	},
	".tok-string": {
		color: "var(--studio-syntax-string)",
	},
	".tok-number": {
		color: "var(--studio-syntax-number)",
	},
	".tok-comment": {
		color: "var(--studio-syntax-comment)",
	},
	".tok-operator": {
		color: "var(--studio-syntax-operator)",
	},

	".cm-table-name": {
		color: "var(--studio-syntax-table)",
	},

	".cm-gutters": {
		backgroundColor: "var(--studio-editor-gutter-bg)",
		color: "var(--studio-editor-gutter-text)",
		borderRight: "none",
		width: "30px",
	},

	".cm-tooltip-autocomplete": {
		backgroundColor: "var(--studio-editor-panel-bg)",
		color: "var(--studio-editor-panel-text)",
		border: "1px solid var(--studio-editor-panel-border)",
		borderRadius: "6px",
		boxShadow: "0 2px 6px rgba(0, 0, 0, 0.08)",
	},

	".cm-completionLabel": {
		color: "var(--studio-editor-panel-text)",
	},
	".cm-completionIcon": {
		color: "var(--studio-editor-gutter-text)",
	},
	".cm-completionDetail": {
		color: "var(--studio-editor-gutter-text)",
		fontStyle: "italic",
		marginLeft: "auto",
	},
	".cm-tooltip-autocomplete > ul > li[aria-selected]": {
		backgroundColor: "var(--studio-editor-panel-hover)",
		borderRadius: "3px",
		color: "var(--studio-editor-panel-text)",
	},
});
