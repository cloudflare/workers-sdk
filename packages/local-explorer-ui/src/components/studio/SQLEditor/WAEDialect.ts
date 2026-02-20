import { SQLDialect } from "@codemirror/lang-sql";

export const waeBuiltinFunctionList = [
	"count",
	"distinct",
	"sum",
	"avg",
	"min",
	"max",
	"quantileWeighted",
	"intDiv",
	"toUInt32",
	"length",
	"isEmpty",
	"toLower",
	"toUpper",
	"startsWith",
	"endsWith",
	"position",
	"substring",
	"format",
	"toDateTime",
	"now",
	"toUnixTimestamp",
	"formatDateTime",
	"toStartOfInterval",
	"extract",
];

export const StudioWAEDialect = SQLDialect.define({
	keywords:
		"select group by limit where from if show tables " +
		waeBuiltinFunctionList.join(" ").toLowerCase(),
	builtin: "",
	types: "",
	operatorChars: "*/+-%<>!=~",
	doubleQuotedStrings: true,
	charSetCasts: false,
});
