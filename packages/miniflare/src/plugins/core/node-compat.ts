import { isNodejsCompatDefaultOn } from "@cloudflare/workers-utils";

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
 * The compatibility date on which `nodejs_compat` started implying
 * `nodejs_compat_v2`.
 */
const NODEJS_COMPAT_V2_SWITCH_OVER_DATE = "2024-09-23";

/**
 * Computes the Node.js compatibility mode we are running.
 *
 * This mirrors how workerd itself resolves the `nodejs_compat` and
 * `nodejs_compat_v2` flags, which depends on both the compatibility date and
 * the compatibility flags:
 * - Both flags are enabled by default from `NODEJS_COMPAT_DEFAULT_ON_DATE`
 *   onwards, and each must be turned off separately from that date, with
 *   `no_nodejs_compat` and `no_nodejs_compat_v2` respectively.
 * - Before that date, `nodejs_compat` implies `nodejs_compat_v2` from
 *   `NODEJS_COMPAT_V2_SWITCH_OVER_DATE` onwards.
 *
 * @param compatibilityDate The compatibility date
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
		hasNoNodejsCompatFlag,
		hasNodejsCompatV2Flag,
		hasNoNodejsCompatV2Flag,
		hasExperimentalNodejsCompatV2Flag,
	} = parseNodeCompatibilityFlags(compatibilityFlags);

	const isDefaultOn = isNodejsCompatDefaultOn(compatibilityDate);

	const nodejsCompatEnabled =
		hasNodejsCompatFlag || (isDefaultOn && !hasNoNodejsCompatFlag);

	const nodejsCompatV2Enabled =
		hasNodejsCompatV2Flag ||
		(!hasNoNodejsCompatV2Flag &&
			(isDefaultOn ||
				(nodejsCompatEnabled &&
					compatibilityDate >= NODEJS_COMPAT_V2_SWITCH_OVER_DATE)));

	let mode: NodeJSCompatMode = null;
	if (nodejsCompatV2Enabled) {
		mode = "v2";
	} else if (nodejsCompatEnabled) {
		mode = "v1";
	} else if (hasNodejsAlsFlag) {
		mode = "als";
	}

	return {
		mode,
		// Whether workerd will enable the `nodejs_compat`/`nodejs_compat_v2`
		// features, accounting for both the flags and the compatibility date.
		isNodejsCompatEnabled: nodejsCompatEnabled,
		isNodejsCompatV2Enabled: nodejsCompatV2Enabled,
		// Whether each flag was explicitly specified.
		hasNodejsAlsFlag,
		hasNodejsCompatFlag,
		hasNoNodejsCompatFlag,
		hasNodejsCompatV2Flag,
		hasNoNodejsCompatV2Flag,
		hasExperimentalNodejsCompatV2Flag,
	};
}

function parseNodeCompatibilityFlags(compatibilityFlags: string[]) {
	return {
		hasNodejsAlsFlag: compatibilityFlags.includes("nodejs_als"),
		hasNodejsCompatFlag: compatibilityFlags.includes("nodejs_compat"),
		hasNoNodejsCompatFlag: compatibilityFlags.includes("no_nodejs_compat"),
		hasNodejsCompatV2Flag: compatibilityFlags.includes("nodejs_compat_v2"),
		hasNoNodejsCompatV2Flag: compatibilityFlags.includes("no_nodejs_compat_v2"),
		hasExperimentalNodejsCompatV2Flag: compatibilityFlags.includes(
			"experimental:nodejs_compat_v2"
		),
	};
}
