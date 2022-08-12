/**
 * Pages error when no routes are found in the functions directory
 */
export class FunctionsNoRoutesError extends Error {
	constructor(message: string) {
		super(message);
	}
}
/**
 * Exit code for `pages functions build` when no routes are found.
 */
export const EXIT_CODE_FUNCTIONS_NO_ROUTES_ERROR = 156;

/** Warning message for when buildFunctions throws FunctionsNoRoutesError */
export function getFunctionsNoRoutesWarning(
	functionsDirectory: string,
	suffix?: string
) {
	return `No routes found when building Functions directory: ${functionsDirectory}${
		suffix ? " - " + suffix : ""
	}`;
}
