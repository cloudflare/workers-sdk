import { logBuildFailure, logBuildWarnings } from "../../logger";
import { rewriteNodeCompatBuildFailure } from "../build-failures";
import type { Plugin } from "esbuild";
import type { NodeJSCompatMode } from "miniflare";

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
		setup(build) {
			build.onStart(() => {
				onStart?.();
			});
			build.onEnd(async ({ errors, warnings }) => {
				if (errors.length > 0) {
					if (nodejsCompatMode !== "legacy") {
						rewriteNodeCompatBuildFailure(errors, nodejsCompatMode);
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
