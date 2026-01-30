/**
 * JavaScript identifier validation and normalization utilities.
 */

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

const reservedKeywordRegex = new RegExp(`^(${RESERVED_KEYWORDS.join("|")})$`);

const identifierNameRegex =
	/^(?:[$_\p{ID_Start}])(?:[$_\u200C\u200D\p{ID_Continue}])*$/u;

const validIdentifierRegex = new RegExp(
	`(?!(${reservedKeywordRegex.source})$)${identifierNameRegex.source}`,
	"u"
);

/**
 * Check if a string is a valid JavaScript identifier.
 */
export const isValidIdentifier = (identifier: string): boolean =>
	validIdentifierRegex.test(identifier);

/**
 * Normalize a string to a valid JavaScript identifier by replacing
 * invalid characters with underscores.
 */
export const normalizeIdentifier = (identifier: string): string =>
	identifier.replace(
		/(?:^[^$_\p{ID_Start}])|[^$_\u200C\u200D\p{ID_Continue}]/gu,
		"_"
	);
