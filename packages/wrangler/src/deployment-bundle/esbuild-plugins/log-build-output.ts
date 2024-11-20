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
				if (!bundled) {
					// First bundle, no need to update bundle or log errors
					bundled = true;

					// But we still want to log warnings as these are not repeated in first-time build failures
					if (warnings.length > 0) {
						logBuildWarnings(warnings);
					}
				} else {
					if (errors.length > 0) {
						rewriteNodeCompatBuildFailure(errors, nodejsCompatMode);
						logBuildFailure(errors, warnings);
						return;
					}

					if (warnings.length > 0) {
						logBuildWarnings(warnings);
					}

					await updateBundle?.();
				}
			});
		},
	};
}
