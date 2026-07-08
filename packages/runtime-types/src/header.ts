/**
 * Prefix of the comment written above the generated runtime types. Used to
 * detect when runtime types need to be regenerated (the full header encodes the
 * workerd version, compatibility date and flags).
 */
export const RUNTIME_HEADER_COMMENT_PREFIX =
	"// Runtime types generated with workerd@";

/**
 * Marker line written immediately before the generated runtime types. Used to
 * locate the start of the runtime section within a combined `.d.ts` file.
 */
export const RUNTIME_TYPES_MARKER = "// Begin runtime types";

/**
 * Generates the runtime header string used in the generated types file.
 * This header is used to detect when runtime types need to be regenerated.
 */
export function getRuntimeHeader(
	workerdVersion: string,
	compatibilityDate: string,
	compatibilityFlags: string[] = []
): string {
	return `${RUNTIME_HEADER_COMMENT_PREFIX}${workerdVersion} ${compatibilityDate} ${[...compatibilityFlags].sort().join(",")}`;
}
