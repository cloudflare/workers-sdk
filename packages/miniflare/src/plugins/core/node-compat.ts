/**
 * We can provide Node.js compatibility in a number of different modes:
 * - "als": this mode tells the workerd runtime to enable only the Async Local Storage builtin library (accessible via `node:async_hooks`).
 * - "v1" - this mode tells the workerd runtime to enable some Node.js builtin libraries (accessible only via `node:...` imports) but no globals.
 * - "v2" - this mode tells the workerd runtime to enable more Node.js builtin libraries (accessible both with and without the `node:` prefix)
 *   and also some Node.js globals such as `Buffer`; it also turns on additional compile-time polyfills for those that are not provided by the runtime.
 *  - null - no Node.js compatibility.
 */
export type NodeJSCompatMode = "als" | "v1" | "v2" | null;

/**
 * Computes the Node.js compatibility mode we are running.
 *
 * NOTES:
 * - The v2 mode is configured via `nodejs_compat_v2` compat flag or via `nodejs_compat` plus a compatibility date of Sept 23rd. 2024 or later.
 *
 * @param compatibilityDateStr The compatibility date
 * @param compatibilityFlags The compatibility flags
 * @returns the mode and flags to indicate specific configuration for validating.
 */
export function getNodeCompat(
	compatibilityDate: string = "2000-01-01", // Default to some arbitrary old date
	compatibilityFlags: string[]
) {
	const {
		hasNodejsAlsFlag,
		hasNodejsCompatFlag,
		hasNodejsCompatV2Flag,
		hasNoNodejsCompatV2Flag,
		hasExperimentalNodejsCompatV2Flag,
	} = parseNodeCompatibilityFlags(compatibilityFlags);

	const nodeCompatSwitchOverDate = "2024-09-23";
	let mode: NodeJSCompatMode = null;
	if (
		hasNodejsCompatV2Flag ||
		(hasNodejsCompatFlag &&
			compatibilityDate >= nodeCompatSwitchOverDate &&
			!hasNoNodejsCompatV2Flag)
	) {
		mode = "v2";
	} else if (hasNodejsCompatFlag) {
		mode = "v1";
	} else if (hasNodejsAlsFlag) {
		mode = "als";
	}

	return {
		mode,
		hasNodejsAlsFlag,
		hasNodejsCompatFlag,
		hasNodejsCompatV2Flag,
		hasNoNodejsCompatV2Flag,
		hasExperimentalNodejsCompatV2Flag,
	};
}

function parseNodeCompatibilityFlags(compatibilityFlags: string[]) {
	return {
		hasNodejsAlsFlag: compatibilityFlags.includes("nodejs_als"),
		hasNodejsCompatFlag: compatibilityFlags.includes("nodejs_compat"),
		hasNodejsCompatV2Flag: compatibilityFlags.includes("nodejs_compat_v2"),
		hasNoNodejsCompatV2Flag: compatibilityFlags.includes("no_nodejs_compat_v2"),
		hasExperimentalNodejsCompatV2Flag: compatibilityFlags.includes(
			"experimental:nodejs_compat_v2"
		),
	};
}
