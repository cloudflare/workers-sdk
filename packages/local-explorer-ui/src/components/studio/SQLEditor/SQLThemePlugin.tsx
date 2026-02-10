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

/**
 * Unified CodeMirror theme that uses CSS custom properties from tailwind.css.
 * Automatically adapts to light/dark mode via prefers-color-scheme media queries
 * without needing any runtime dark mode detection.
 */
export const StudioSQLTheme = EditorView.baseTheme({
	/* Cursor — ensure the caret is visible against both light and dark backgrounds */
	".cm-content": {
		caretColor: "var(--color-text)",
	},

	/* Selection highlight */
	"&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
		backgroundColor: "var(--color-selection) !important",
	},

	/* Active line */
	".cm-activeLine": {
		backgroundColor: "var(--color-active-line)",
	},
	".cm-activeLineGutter": {
		backgroundColor: "var(--color-active-line)",
	},

	/* Syntax token colors */
	".tok-keyword": {
		color: "var(--color-syntax-keyword)",
	},
	".tok-string": {
		color: "var(--color-syntax-string)",
	},
	".tok-number": {
		color: "var(--color-syntax-number)",
	},
	".tok-comment": {
		color: "var(--color-syntax-comment)",
	},
	".tok-operator": {
		color: "var(--color-syntax-operator)",
	},

	".cm-table-name": {
		color: "var(--color-syntax-table)",
	},

	/* Gutters */
	".cm-gutters": {
		backgroundColor: "var(--color-bg-secondary)",
		color: "var(--color-muted)",
		borderRight: "none",
		width: "30px",
	},

	/* Autocomplete tooltip */
	".cm-tooltip-autocomplete": {
		backgroundColor: "var(--color-bg)",
		color: "var(--color-text)",
		border: "1px solid var(--color-border)",
		borderRadius: "6px",
		boxShadow: "0 2px 6px rgba(0, 0, 0, 0.08)",
	},

	".cm-completionLabel": {
		color: "var(--color-text)",
	},
	".cm-completionIcon": {
		color: "var(--color-muted)",
	},
	".cm-completionDetail": {
		color: "var(--color-muted)",
		fontStyle: "italic",
		marginLeft: "auto",
	},
	".cm-tooltip-autocomplete > ul > li[aria-selected]": {
		backgroundColor: "var(--color-accent)",
		borderRadius: "3px",
		color: "var(--color-text)",
	},
});
