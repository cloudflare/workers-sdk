/**
 * We can provide Node.js compatibility in a number of different modes:
 * - "legacy" - this mode adds compile-time polyfills that are not well maintained and cannot work with workerd runtime builtins.
 * - "als": this mode tells the workerd runtime to enable only the Async Local Storage builtin library (accessible via `node:async_hooks`).
 * - "v1" - this mode tells the workerd runtime to enable some Node.js builtin libraries (accessible only via `node:...` imports) but no globals.
 * - "v2" - this mode tells the workerd runtime to enable more Node.js builtin libraries (accessible both with and without the `node:` prefix)
 *   and also some Node.js globals such as `Buffer`; it also turns on additional compile-time polyfills for those that are not provided by the runtime.
 *  - null - no Node.js compatibility.
 */
export type NodeJSCompatMode = "legacy" | "als" | "v1" | "v2" | null;

/**
 * Computes the Node.js compatibility mode we are running.
 *
 * NOTE:
 * Currently v2 mode is configured via `nodejs_compat_v2` compat flag.
 * At a future compatibility date, the use of `nodejs_compat` flag will imply `nodejs_compat_v2`.
 *
 * see `EnvironmentInheritable` for `nodeCompat` and `noBundle`.
 *
 * @param compatibilityDateStr The compatibility date
 * @param compatibilityFlags The compatibility flags
 * @param opts.nodeCompat Whether the legacy node_compat arg is being used
 * @returns the mode and flags to indicate specific configuration for validating.
 */
export function getNodeCompatMode(
	compatibilityDateStr: string = "2000-01-01", // Default to some arbitrary old date
	compatibilityFlags: string[],
	opts?: {
		nodeCompat?: boolean;
	}
) {
	const { nodeCompat = false } = opts ?? {};
	const {
		hasNodejsAlsFlag,
		hasNodejsCompatFlag,
		hasNodejsCompatV2Flag,
		hasExperimentalNodejsCompatV2Flag,
	} = parseNodeCompatibilityFlags(compatibilityFlags);

	const nodeCompatSwitchOverDate = new Date(2024, 8, 23); // 2024 Sept 23
	const [compatYear, compatMonth, compatDay] = compatibilityDateStr.split("-");
	const compatibilityDate = new Date(
		Number(compatYear),
		Number(compatMonth) - 1,
		Number(compatDay)
	);
	const legacy = nodeCompat === true;
	let mode: NodeJSCompatMode = null;
	if (
		hasNodejsCompatV2Flag ||
		(hasNodejsCompatFlag && compatibilityDate >= nodeCompatSwitchOverDate)
	) {
		mode = "v2";
	} else if (hasNodejsCompatFlag) {
		mode = "v1";
	} else if (hasNodejsAlsFlag) {
		mode = "als";
	} else if (legacy) {
		mode = "legacy";
	}

	return {
		mode,
		hasNodejsAlsFlag,
		hasNodejsCompatFlag,
		hasNodejsCompatV2Flag,
		hasExperimentalNodejsCompatV2Flag,
	};
}

function parseNodeCompatibilityFlags(compatibilityFlags: string[]) {
	return {
		hasNodejsAlsFlag: compatibilityFlags.includes("nodejs_als"),
		hasNodejsCompatFlag: compatibilityFlags.includes("nodejs_compat"),
		hasNodejsCompatV2Flag: compatibilityFlags.includes("nodejs_compat_v2"),
		hasExperimentalNodejsCompatV2Flag: compatibilityFlags.includes(
			"experimental:nodejs_compat_v2"
		),
	};
}
