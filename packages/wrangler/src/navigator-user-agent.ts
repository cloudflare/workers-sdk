import assert from "node:assert";

export function isNavigatorDefined(
	compatibility_date: string | undefined,
	compatibility_flags: string[] = []
) {
	assert(
		!(
			compatibility_flags.includes("global_navigator") &&
			compatibility_flags.includes("no_global_navigator")
		),
		"Can't both enable and disable a flag"
	);
	if (compatibility_flags.includes("global_navigator")) {
		return true;
	}
	if (compatibility_flags.includes("no_global_navigator")) {
		return false;
	}
	return !!compatibility_date && compatibility_date >= "2022-03-21";
}
