import { UserError } from "@cloudflare/workers-utils";

export function isNavigatorDefined(
	compatibility_date: string | undefined,
	compatibility_flags: string[] = []
) {
	if (
		compatibility_flags.includes("global_navigator") &&
		compatibility_flags.includes("no_global_navigator")
	) {
		throw new UserError(
			'Conflicting compatibility flags: "global_navigator" and "no_global_navigator" cannot both be set. Remove one of these flags from your configuration.',
			{
				telemetryMessage: "navigator user agent compatibility flags conflict",
			}
		);
	}

	if (compatibility_flags.includes("global_navigator")) {
		return true;
	}
	if (compatibility_flags.includes("no_global_navigator")) {
		return false;
	}
	return !!compatibility_date && compatibility_date >= "2022-03-21";
}
