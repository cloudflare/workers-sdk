import { UserError } from "@cloudflare/workers-utils";
import { getNodeCompat } from "miniflare";

export function isProcessEnvPopulated(
	compatibility_date: string | undefined,
	compatibility_flags: string[] = []
) {
	if (
		compatibility_flags.includes("nodejs_compat_populate_process_env") &&
		compatibility_flags.includes("nodejs_compat_do_not_populate_process_env")
	) {
		throw new UserError(
			'Conflicting compatibility flags: "nodejs_compat_populate_process_env" and "nodejs_compat_do_not_populate_process_env" cannot both be set. Remove one of these flags from your configuration.',
			{
				telemetryMessage: "process env compatibility flags conflict",
			}
		);
	}

	// Node.js compat can be enabled explicitly via a flag or implicitly by the compatibility date,
	// so defer to `getNodeCompat` rather than checking for the `nodejs_compat` flag directly.
	// The "als" mode (Async Local Storage only) does not count as full Node.js compat here.
	const nodejsCompatMode = getNodeCompat(
		compatibility_date,
		compatibility_flags
	).mode;
	const nodejsCompatEnabled =
		nodejsCompatMode === "v1" || nodejsCompatMode === "v2";

	if (
		compatibility_flags.includes("nodejs_compat_populate_process_env") &&
		nodejsCompatEnabled
	) {
		return true;
	}
	if (
		compatibility_flags.includes("nodejs_compat_do_not_populate_process_env")
	) {
		return false;
	}
	return (
		nodejsCompatEnabled &&
		!!compatibility_date &&
		compatibility_date >= "2025-04-01"
	);
}
