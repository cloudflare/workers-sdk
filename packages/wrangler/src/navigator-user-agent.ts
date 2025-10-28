import { UserError } from "@cloudflare/workers-utils";

export function isNavigatorDefined(
	compatibility_date: string | undefined,
	compatibility_flags: string[] = []
) {
	if (
		compatibility_flags.includes("global_navigator") &&
		compatibility_flags.includes("no_global_navigator")
	) {
		throw new UserError("Can't both enable and disable a flag");
	}

	if (compatibility_flags.includes("global_navigator")) {
		return true;
	}
	if (compatibility_flags.includes("no_global_navigator")) {
		return false;
	}
	return !!compatibility_date && compatibility_date >= "2022-03-21";
}
