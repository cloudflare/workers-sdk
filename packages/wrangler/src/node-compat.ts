import type { Config } from "./config";

/**
 * Wrangler can provide Node.js compatibility in a number of different modes:
 * - "legacy" - this mode adds compile-time polyfills that are not well maintained and cannot work with workerd runtime builtins.
 * - "v1" - this mode tells the workerd runtime to enable some Node.js builtin libraries (accessible only via `node:...` imports) but no globals.
 * - "v2" - this mode tells the workerd runtime to enable more Node.js builtin libraries (accessible both with and without the `node:` prefix)
 *   and also some Node.js globals such as `Buffer`; it also turns on additional compile-time polyfills for those that are not provided by the runtime.
 */
export type NodeJSCompatMode = "legacy" | "v1" | "v2" | null;

export function getNodeCompatMode({
	compatibility_flags,
	node_compat,
}: Pick<Config, "compatibility_flags" | "node_compat">) {
	const nodejsCompat = compatibility_flags.includes("nodejs_compat");
	const nodejsCompatV2 = compatibility_flags.includes(
		"experimental:nodejs_compat_v2"
	);

	let mode: NodeJSCompatMode;
	if (nodejsCompatV2) {
		mode = "v2";
	} else if (nodejsCompat) {
		mode = "v1";
	} else if (node_compat) {
		mode = "legacy";
	} else {
		mode = null;
	}

	return {
		legacy: mode === "legacy",
		mode,
		nodejsCompat,
		nodejsCompatV2,
	};
}

/**
 * The nodejs_compat_v2 flag currently requires an `experimental:` prefix within Wrangler,
 * but this needs to be stripped before sending to workerd, since that doesn't know about that.
 *
 * TODO: Remove this function when we graduate nodejs_v2 to non-experimental.
 * See https://jira.cfdata.org/browse/DEVDASH-218
 */
export function stripExperimentalPrefixes(
	compatFlags: string[] | undefined
): string[] | undefined {
	return compatFlags?.map((flag) => flag.replace(/^experimental:/, ""));
}
