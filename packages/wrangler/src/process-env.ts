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

	// Node.js compatibility can be enabled by the `nodejs_compat` flag, or by the
	// compatibility date alone from `NODEJS_COMPAT_DEFAULT_ON_DATE` onwards.
	const { isNodejsCompatEnabled } = getNodeCompat(
		compatibility_date,
		compatibility_flags
	);

	if (
		compatibility_flags.includes("nodejs_compat_populate_process_env") &&
		isNodejsCompatEnabled
	) {
		return true;
	}
	if (
		compatibility_flags.includes("nodejs_compat_do_not_populate_process_env")
	) {
		return false;
	}
	return (
		isNodejsCompatEnabled &&
		!!compatibility_date &&
		compatibility_date >= "2025-04-01"
	);
}
