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
			backgroundColor: "black",
			color: "#fff",
			borderRight: "none",
			width: "30px",
		},

		// Dark mode auto completion styling
		".cm-tooltip-autocomplete": {
			backgroundColor: "#000",
			color: "#fff",
			border: "1px solid #444", // Better contrast against pure black
			borderRadius: "6px",
			boxShadow: "0 2px 6px rgba(255, 255, 255, 0.1)", // Subtle glow
		},

		".cm-completionLabel": {
			color: "#eee",
		},
		".cm-completionIcon": {
			color: "#aaa",
		},
		".cm-completionDetail": {
			color: "#777",
			fontStyle: "italic",
			marginLeft: "auto",
		},
		".cm-tooltip-autocomplete > ul > li[aria-selected]": {
			backgroundColor: "#333",
			color: "#fff",
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
			backgroundColor: "white",
			color: "#858585",
			borderRight: "none",
			width: "30px",
		},

		// Auto completion styling
		".cm-tooltip-autocomplete": {
			backgroundColor: "#fff", // White background
			color: "#000", // Black text
			border: "1px solid #ccc", // Light gray border
			borderRadius: "6px",
			boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)", // Subtle shadow for depth
			padding: "3px",
		},

		".cm-completionLabel": {
			color: "#111",
		},
		".cm-completionIcon": {
			color: "#666",
		},
		".cm-completionDetail": {
			color: "#888",
			fontStyle: "italic",
			marginLeft: "auto",
		},
		".cm-tooltip-autocomplete > ul > li[aria-selected]": {
			backgroundColor: "#ddd",
			borderRadius: "3px",
			color: "#000",
		},
	},
	{ dark: false }
);
