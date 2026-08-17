import { isNodejsCompatDefaultOn } from "@cloudflare/workers-utils";

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
 * Returns the compatibility flags passed to workerd's runtime type generator.
 * Node.js compatibility is excluded because those types come from `@types/node`.
 */
export function getRuntimeCompatibilityFlags(
	compatibilityDate: string,
	compatibilityFlags: string[] = []
): string[] {
	const runtimeCompatibilityFlags = compatibilityFlags.filter(
		(flag) => !flag.includes("nodejs_compat")
	);
	if (isNodejsCompatDefaultOn(compatibilityDate)) {
		runtimeCompatibilityFlags.push("no_nodejs_compat", "no_nodejs_compat_v2");
	}
	return runtimeCompatibilityFlags;
}

/**
 * Generates the runtime header string used in the generated types file.
 * This header is used to detect when runtime types need to be regenerated.
 */
export function getRuntimeHeader(
	workerdVersion: string,
	compatibilityDate: string,
	compatibilityFlags: string[] = []
): string {
	const runtimeCompatibilityFlags = getRuntimeCompatibilityFlags(
		compatibilityDate,
		compatibilityFlags
	);
	return `${RUNTIME_HEADER_COMMENT_PREFIX}${workerdVersion} ${compatibilityDate} ${runtimeCompatibilityFlags.sort().join(",")}`;
}
