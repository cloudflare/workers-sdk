import { UserError } from "@cloudflare/workers-utils";

export function isProcessEnvPopulated(
	compatibility_date: string | undefined,
	compatibility_flags: string[] = []
) {
	if (
		compatibility_flags.includes("nodejs_compat_populate_process_env") &&
		compatibility_flags.includes("nodejs_compat_do_not_populate_process_env")
	) {
		throw new UserError("Can't both enable and disable a flag");
	}

	if (
		compatibility_flags.includes("nodejs_compat_populate_process_env") &&
		compatibility_flags.includes("nodejs_compat")
	) {
		return true;
	}
	if (
		compatibility_flags.includes("nodejs_compat_do_not_populate_process_env")
	) {
		return false;
	}
	return (
		compatibility_flags.includes("nodejs_compat") &&
		!!compatibility_date &&
		compatibility_date >= "2025-04-01"
	);
}
