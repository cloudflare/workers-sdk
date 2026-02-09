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

export const StudioSQLDarkModeTheme = EditorView.theme(
	{
		".tok-keyword": {
			color: "#4078f2",
		},
		".tok-string": {
			color: "#d16969",
		},
		".tok-number": {
			color: "#808080",
		},
		".tok-comment": {
			color: "#6a737d",
		},
		".tok-operator": {
			color: "#bfbfbf",
		},

		".cm-table-name": {
			color: "#fd79a8",
		},

		".cm-gutters": {
			backgroundColor: "#1a1412",
			color: "#ffeee6",
			borderRight: "none",
			width: "30px",
		},

		// Dark mode auto completion styling
		".cm-tooltip-autocomplete": {
			backgroundColor: "#0f0c0a",
			color: "#ffeee6",
			border: "1px solid #3d2e24",
			borderRadius: "6px",
			boxShadow: "0 2px 6px rgba(255, 107, 51, 0.08)",
		},

		".cm-completionLabel": {
			color: "#ffeee6",
		},
		".cm-completionIcon": {
			color: "#a08678",
		},
		".cm-completionDetail": {
			color: "#a08678",
			fontStyle: "italic",
			marginLeft: "auto",
		},
		".cm-tooltip-autocomplete > ul > li[aria-selected]": {
			backgroundColor: "#2e221a",
			color: "#ffeee6",
		},
	},
	{ dark: true }
);

export const StudioSQLLightModeTheme = EditorView.theme(
	{
		".tok-keyword": {
			color: "#0000ff",
		},
		".tok-string": {
			color: "#d16969",
		},
		".tok-number": {
			color: "#098658",
		},
		".tok-comment": {
			color: "#6a737d",
		},
		".tok-operator": {
			color: "#5a5a5a",
		},

		".cm-table-name": {
			color: "#e84393",
		},

		".cm-gutters": {
			backgroundColor: "#fffdfb",
			color: "#8a6e5c",
			borderRight: "none",
			width: "30px",
		},

		// Auto completion styling
		".cm-tooltip-autocomplete": {
			backgroundColor: "#fffdfb",
			color: "#521000",
			border: "1px solid #ebd5c1",
			borderRadius: "6px",
			boxShadow: "0 2px 6px rgba(255, 72, 1, 0.06)",
			padding: "3px",
		},

		".cm-completionLabel": {
			color: "#521000",
		},
		".cm-completionIcon": {
			color: "#8a6e5c",
		},
		".cm-completionDetail": {
			color: "#8a6e5c",
			fontStyle: "italic",
			marginLeft: "auto",
		},
		".cm-tooltip-autocomplete > ul > li[aria-selected]": {
			backgroundColor: "#f0e6dc",
			borderRadius: "3px",
			color: "#521000",
		},
	},
	{ dark: false }
);
