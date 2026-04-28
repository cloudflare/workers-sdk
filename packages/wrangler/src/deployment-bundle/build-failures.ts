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
 * RegExp matching against esbuild's error text when it is unable to resolve
 * a module. Used to detect when we should suggest the `alias` config.
 */
const couldNotResolveErrorText = /^Could not resolve "(.+?)"$/;

/**
 * Text that appears in esbuild's notes when it suggests marking a module as external.
 */
const markAsExternalNoteText = "as external to exclude it from the bundle";

/**
 * Rewrites esbuild BuildFailures for failing to resolve modules to suggest
 * using the `alias` config option in wrangler.json.
 */
export function rewriteUnresolvedModuleBuildFailure(errors: esbuild.Message[]) {
	for (const error of errors) {
		const match = couldNotResolveErrorText.exec(error.text);
		// Note: we skip Node built-in modules since these are handled by rewriteNodeCompatBuildFailure
		if (match !== null && !nodeBuiltinResolveErrorText.test(error.text)) {
			const hasExternalSuggestion = error.notes?.some((note) =>
				note.text?.includes(markAsExternalNoteText)
			);
			if (hasExternalSuggestion) {
				// Filter out esbuild's "mark as external" suggestion since we provide our own
				error.notes = [
					...(error.notes ?? []).filter(
						(note) => !note.text?.includes(markAsExternalNoteText)
					),
					{
						location: null,
						text:
							`To fix this, you can add an entry to "alias" in your Wrangler configuration.\n` +
							`For more guidance see: https://developers.cloudflare.com/workers/wrangler/configuration/#bundling-issues\n`,
					},
				];
			}
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
