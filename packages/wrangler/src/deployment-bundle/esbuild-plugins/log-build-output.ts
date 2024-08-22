import { logBuildFailure, logBuildWarnings } from "../../logger";
import { rewriteNodeCompatBuildFailure } from "../build-failures";
import type { NodeJSCompatMode } from "../node-compat";
import type { Plugin } from "esbuild";

/**
 * Log esbuild warnings and errors
 */
export function logBuildOutput(
	nodejsCompatMode: NodeJSCompatMode | undefined,
	onStart?: () => void,
	updateBundle?: () => void
): Plugin {
	let bundled = false;

	return {
		name: "log-build-output",
		setup(b) {
			b.onStart(() => {
				onStart?.();
			});
			b.onEnd(async (result) => {
				const errors = result.errors;
				const warnings = result.warnings;
				if (errors.length > 0) {
					if (nodejsCompatMode !== "legacy") {
						rewriteNodeCompatBuildFailure(result.errors);
					}
					logBuildFailure(errors, warnings);
					return;
				}

				if (warnings.length > 0) {
					logBuildWarnings(warnings);
				}

				if (!bundled) {
					// First bundle, no need to update bundle
					bundled = true;
				} else {
					await updateBundle?.();
				}
			});
		},
	};
}
