const RESERVED_KEYWORDS = [
	"do",
	"if",
	"in",
	"for",
	"let",
	"new",
	"try",
	"var",
	"case",
	"else",
	"enum",
	"eval",
	"null",
	"this",
	"true",
	"void",
	"with",
	"await",
	"break",
	"catch",
	"class",
	"const",
	"false",
	"super",
	"throw",
	"while",
	"yield",
	"delete",
	"export",
	"import",
	"public",
	"return",
	"static",
	"switch",
	"typeof",
	"default",
	"extends",
	"finally",
	"package",
	"private",
	"continue",
	"debugger",
	"function",
	"arguments",
	"interface",
	"protected",
	"implements",
	"instanceof",
	"NaN",
	"Infinity",
	"undefined",
];

const reservedKeywordRegex = new RegExp(`^${RESERVED_KEYWORDS.join("|")}$`);

const identifierNameRegex =
	/^(?:[$_\p{ID_Start}])(?:[$_\u200C\u200D\p{ID_Continue}])*$/u;

const validIdentifierRegex = new RegExp(
	`(?!(${reservedKeywordRegex.source})$)${identifierNameRegex.source}`,
	"u"
);

export const isValidIdentifier = (identifier: string) =>
	validIdentifierRegex.test(identifier);

export const normalizeIdentifier = (identifier: string) =>
	identifier.replace(
		/(?:^[^$_\p{ID_Start}])|[^$_\u200C\u200D\p{ID_Continue}]/gu,
		"_"
	);
