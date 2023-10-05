import { builtinModules } from "node:module";
import type * as esbuild from "esbuild";

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
	forPages = false
) {
	for (const error of errors) {
		const match = nodeBuiltinResolveErrorText.exec(error.text);
		if (match !== null) {
			const issue = `The package "${match[1]}" wasn't found on the file system but is built into node.`;

			const instructionForUser = `${
				forPages
					? 'Add the "nodejs_compat" compatibility flag to your Pages project'
					: 'Add "node_compat = true" to your wrangler.toml file'
			} to enable Node.js compatibility.`;

			error.notes = [
				{
					location: null,
					text: `${issue}\n${instructionForUser}`,
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
