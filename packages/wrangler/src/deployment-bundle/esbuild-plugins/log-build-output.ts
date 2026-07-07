import { logBuildFailure, logBuildWarnings } from "../../logger";
import type { Message, Plugin } from "esbuild";
import type { NodeJSCompatMode } from "miniflare";

/**
 * Log esbuild warnings and errors
 *
 * When `onRebuildError` is provided, watch-mode rebuild failures are
 * delegated to it instead of being logged here, so the caller can route
 * them through its own error handling (which owns the logging).
 */
export function logBuildOutput(
	nodejsCompatMode: NodeJSCompatMode | undefined,
	onStart?: () => void,
	updateBundle?: () => void,
	onRebuildError?: (errors: Message[], warnings: Message[]) => void
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
						if (onRebuildError) {
							onRebuildError(errors, warnings);
						} else {
							logBuildFailure(errors, warnings);
						}
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
