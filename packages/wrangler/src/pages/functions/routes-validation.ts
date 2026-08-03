import {
	RoutesValidationError,
	isRoutesJSONSpec,
	validateRoutes as packageValidateRoutes,
	getRoutesValidationErrorMessage,
} from "@cloudflare/pages-functions";
// Re-export from @cloudflare/pages-functions — this file is kept for
// backward compatibility with existing Wrangler-internal imports and to keep
// the initial migration minimal without changing lots and lots of files
// TODO(dario): after the initial pages-functions migration remove these re-exports
//
// The package's validateRoutes throws plain Error; Wrangler callers
// expect FatalError, so we wrap it here with per-validation telemetry labels.
import { FatalError } from "@cloudflare/workers-utils";

export {
	RoutesValidationError,
	isRoutesJSONSpec,
	getRoutesValidationErrorMessage,
};

/**
 * Map each `RoutesValidationError` code to the telemetry label that Wrangler
 * emitted before the pages-functions extraction.  This preserves per-validation
 * telemetry granularity.
 */
const VALIDATION_TELEMETRY: Record<RoutesValidationError, string> = {
	[RoutesValidationError.INVALID_JSON_SPEC]:
		"pages functions routes invalid json spec",
	[RoutesValidationError.NO_INCLUDE_RULES]:
		"pages functions routes missing include rules",
	[RoutesValidationError.TOO_MANY_RULES]:
		"pages functions routes too many rules",
	[RoutesValidationError.RULE_TOO_LONG]: "pages functions routes rule too long",
	[RoutesValidationError.INVALID_RULES]: "pages functions routes invalid rules",
	[RoutesValidationError.OVERLAPPING_RULES]:
		"pages functions routes overlapping rules",
};

/**
 * Determine which `RoutesValidationError` code produced the given error message
 * by comparing against the known error messages for the given `routesPath`.
 *
 * @param message - The error message thrown by the package
 * @param routesPath - The routes path passed to `validateRoutes`
 * @returns The matching error code, or `undefined` if none matched
 */
function identifyValidationError(
	message: string,
	routesPath: string
): RoutesValidationError | undefined {
	for (const code of Object.values(RoutesValidationError)) {
		if (typeof code === "number") {
			const expected = getRoutesValidationErrorMessage(code, routesPath);
			if (message === expected) {
				return code;
			}
		}
	}
	return undefined;
}

/**
 * Validate a RoutesJSONSpec, throwing a FatalError on failure.
 *
 * Wraps the package-level `validateRoutes` to convert plain errors into
 * Wrangler-compatible `FatalError` instances for consistent CLI error handling,
 * preserving the original per-validation telemetry labels.
 *
 * @param routesJSON - The routes spec to validate
 * @param routesPath - Path to the _routes.json file
 * @throws FatalError when the spec is invalid
 */
export function validateRoutes(
	routesJSON: Parameters<typeof packageValidateRoutes>[0],
	routesPath: string
) {
	try {
		packageValidateRoutes(routesJSON, routesPath);
	} catch (e) {
		if (!(e instanceof Error)) {
			throw e;
		}

		const errorCode = identifyValidationError(e.message, routesPath);
		if (errorCode === undefined) {
			throw e;
		}

		throw new FatalError(e.message, {
			code: 1,
			telemetryMessage: VALIDATION_TELEMETRY[errorCode],
		});
	}
}
