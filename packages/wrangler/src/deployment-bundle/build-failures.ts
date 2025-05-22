import { builtinModules } from "node:module";
import type * as esbuild from "esbuild";
import type { NodeJSCompatMode } from "miniflare";

/**
 * RegExp matching against esbuild's error text when it is unable to resolve
 * a Node built-in module. If we detect this when node_compat is disabled,
 * we'll rewrite the error to suggest enabling it.
 */
const nodeBuiltinResolveErrorText = new RegExp(
	'^Could not resolve "(' +
		builtinModules.join("|") +
		"|" +
		builtinModules.map((module) => "node:" + module).join("|") +
		')"$'
);
/**
 * Rewrites esbuild BuildFailures for failing to resolve Node built-in modules
 * to suggest enabling Node compat as opposed to `platform: "node"`.
 */
export function rewriteNodeCompatBuildFailure(
	errors: esbuild.Message[],
	compatMode: NodeJSCompatMode = null
) {
	for (const error of errors) {
		const match = nodeBuiltinResolveErrorText.exec(error.text);
		if (match !== null) {
			let text = `The package "${match[1]}" wasn't found on the file system but is built into node.\n`;

			if (compatMode === null || compatMode === "als") {
				text += `- Add the "nodejs_compat" compatibility flag to your project.\n`;
			} else if (compatMode === "v1" && !match[1].startsWith("node:")) {
				text += `- Make sure to prefix the module name with "node:" or update your compatibility_date to 2024-09-23 or later.\n`;
			}

			error.notes = [
				{
					location: null,
					text,
				},
			];
		}
	}
}
/**
 * Returns true if the passed value looks like an esbuild BuildFailure object
 */
export function isBuildFailure(err: unknown): err is esbuild.BuildFailure {
	return (
		typeof err === "object" &&
		err !== null &&
		"errors" in err &&
		"warnings" in err
	);
}

/**
 * Returns true if the error has a cause that is like an esbuild BuildFailure object.
 */
export function isBuildFailureFromCause(
	err: unknown
): err is { cause: esbuild.BuildFailure } {
	return (
		typeof err === "object" &&
		err !== null &&
		"cause" in err &&
		isBuildFailure(err.cause)
	);
}
