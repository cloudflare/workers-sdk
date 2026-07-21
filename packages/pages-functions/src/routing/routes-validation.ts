import assert from "node:assert";
import {
	MAX_FUNCTIONS_ROUTES_RULE_LENGTH,
	MAX_FUNCTIONS_ROUTES_RULES,
	ROUTES_SPEC_VERSION,
} from "./constants";
import type { RoutesJSONSpec } from "./routes-transformation";

export enum RoutesValidationError {
	INVALID_JSON_SPEC,
	NO_INCLUDE_RULES,
	INVALID_RULES,
	TOO_MANY_RULES,
	RULE_TOO_LONG,
	OVERLAPPING_RULES,
}

/**
 * Check if given routes data is a valid `RoutesJSONSpec`.
 *
 * @param data - The data to validate
 * @returns `true` when `data` conforms to the `RoutesJSONSpec` shape
 */
export function isRoutesJSONSpec(data: unknown): data is RoutesJSONSpec {
	return (
		(typeof data === "object" &&
			data &&
			"version" in data &&
			typeof (data as RoutesJSONSpec).version === "number" &&
			(data as RoutesJSONSpec).version === ROUTES_SPEC_VERSION &&
			Array.isArray((data as RoutesJSONSpec).include) &&
			Array.isArray((data as RoutesJSONSpec).exclude)) ||
		false
	);
}

/**
 * Validate a `RoutesJSONSpec` and throw a descriptive error if it is invalid.
 *
 * @param routesJSON - The routes spec to validate
 * @param routesPath - The file path of the `_routes.json` (used in error messages)
 * @throws Error when the spec is invalid
 */
export function validateRoutes(routesJSON: RoutesJSONSpec, routesPath: string) {
	if (!isRoutesJSONSpec(routesJSON)) {
		throw new Error(
			getRoutesValidationErrorMessage(
				RoutesValidationError.INVALID_JSON_SPEC,
				routesPath
			)
		);
	}

	if (!hasIncludeRules(routesJSON)) {
		throw new Error(
			getRoutesValidationErrorMessage(
				RoutesValidationError.NO_INCLUDE_RULES,
				routesPath
			)
		);
	}

	if (!hasValidRulesCount(routesJSON)) {
		throw new Error(
			getRoutesValidationErrorMessage(
				RoutesValidationError.TOO_MANY_RULES,
				routesPath
			)
		);
	}

	if (!hasValidRuleCharCount(routesJSON)) {
		throw new Error(
			getRoutesValidationErrorMessage(
				RoutesValidationError.RULE_TOO_LONG,
				routesPath
			)
		);
	}

	if (!hasValidRules(routesJSON)) {
		throw new Error(
			getRoutesValidationErrorMessage(
				RoutesValidationError.INVALID_RULES,
				routesPath
			)
		);
	}

	if (
		hasOverlappingRules(routesJSON.include) ||
		hasOverlappingRules(routesJSON.exclude)
	) {
		throw new Error(
			getRoutesValidationErrorMessage(
				RoutesValidationError.OVERLAPPING_RULES,
				routesPath
			)
		);
	}
}

/**
 * Returns true if the given `routingSpec` object contains at least one include routing rule.
 */
function hasIncludeRules(routesJSON: RoutesJSONSpec): boolean {
	if (!routesJSON || !routesJSON.include) {
		throw new Error(
			"Function `hasIncludeRules` was called out of context. Attempting to validate include rules for routes that are undefined or an invalid RoutesJSONSpec"
		);
	}

	return routesJSON?.include?.length > 0;
}

/**
 * Returns true if the given `routesJSON` object contains at most MAX_FUNCTIONS_ROUTES_RULES
 * include and exclude routing rules, combined.
 */
function hasValidRulesCount(routesJSON: RoutesJSONSpec): boolean {
	if (!routesJSON || !routesJSON.include || !routesJSON.exclude) {
		throw new Error(
			"Function `hasValidRulesCount` was called out of context. Attempting to validate maximum rules count for routes that are undefined or an invalid RoutesJSONSpec"
		);
	}

	return (
		routesJSON.include.length + routesJSON.exclude.length <=
		MAX_FUNCTIONS_ROUTES_RULES
	);
}

/**
 * Returns true if each individual routing rule of the given `routesJSON` object is at most
 * MAX_FUNCTIONS_ROUTES_RULE_LENGTH characters long.
 */
function hasValidRuleCharCount(routesJSON: RoutesJSONSpec): boolean {
	if (!routesJSON || !routesJSON.include || !routesJSON.exclude) {
		throw new Error(
			"Function `hasValidRuleCharCount` was called out of context. Attempting to validate rules maximum character count for routes that are undefined or an invalid RoutesJSONSpec"
		);
	}

	const rules = [...routesJSON.include, ...routesJSON.exclude];
	return (
		rules.filter((rule) => rule.length > MAX_FUNCTIONS_ROUTES_RULE_LENGTH)
			.length === 0
	);
}

/**
 * Returns true if each individual routing rule of the given `routesJSON` object is valid.
 * We consider a rule to be valid if it is prefixed by slash ('/').
 */
function hasValidRules(routesJSON: RoutesJSONSpec): boolean {
	if (!routesJSON || !routesJSON.include || !routesJSON.exclude) {
		throw new Error(
			"Function `hasValidRules` was called out of context. Attempting to validate rules for routes that are undefined or an invalid RoutesJSONSpec"
		);
	}

	const rules = [...routesJSON.include, ...routesJSON.exclude];
	return rules.filter((rule) => !rule.match(/^\//)).length === 0;
}

/**
 * Returns true if the given routes array has overlapping routing rules (eg. ["/api/*", "/api/foo"]).
 */
function hasOverlappingRules(routes: string[]): boolean {
	if (!routes) {
		throw new Error(
			"Function `hasOverlappingRules` was called out of context. Attempting to validate rules for routes that are undefined"
		);
	}

	// Find routes that might render other routes redundant
	const endingSplatRoutes = routes.filter((route) => route.endsWith("/*"));

	for (let i = 0; i < endingSplatRoutes.length; i++) {
		const crrRoute = endingSplatRoutes[i];
		assert(crrRoute);
		// Remove splat at the end, leaving the /
		// eg. /api/* -> /api/
		const crrRouteTrimmed = crrRoute.substring(0, crrRoute.length - 1);

		for (let j = 0; j < routes.length; j++) {
			const nextRoute = routes[j];
			assert(nextRoute);
			if (nextRoute !== crrRoute && nextRoute.startsWith(crrRouteTrimmed)) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Get a human-readable error message for a routes validation error.
 *
 * @param errorCode - The type of validation error
 * @param routesPath - Path to the _routes.json file
 * @returns A descriptive error message
 */
export function getRoutesValidationErrorMessage(
	errorCode: RoutesValidationError,
	routesPath: string
): string {
	switch (errorCode) {
		case RoutesValidationError.NO_INCLUDE_RULES:
			return `Invalid _routes.json file found at: ${routesPath}
Routes must have at least 1 include rule, but no include rules were detected.`;
		case RoutesValidationError.TOO_MANY_RULES:
			return `Invalid _routes.json file found at: ${routesPath}
Detected rules that are over the ${MAX_FUNCTIONS_ROUTES_RULES} rule limit. Please make sure you have a total of ${MAX_FUNCTIONS_ROUTES_RULES} include and exclude rules combined.`;
		case RoutesValidationError.RULE_TOO_LONG:
			return `Invalid _routes.json file found at: ${routesPath}
Detected rules the are over the ${MAX_FUNCTIONS_ROUTES_RULE_LENGTH} character limit. Please make sure that each include and exclude routing rule is at most ${MAX_FUNCTIONS_ROUTES_RULE_LENGTH} characters long.`;
		case RoutesValidationError.INVALID_RULES:
			return `Invalid _routes.json file found at: ${routesPath}
All rules must start with '/'.`;
		case RoutesValidationError.OVERLAPPING_RULES:
			return `Invalid _routes.json file found at: ${routesPath}
Overlapping rules found. Please make sure that rules ending with a splat (eg. "/api/*") don't overlap any other rules (eg. "/api/foo"). This applies to both include and exclude rules individually.`;
		case RoutesValidationError.INVALID_JSON_SPEC:
		default:
			return `Invalid _routes.json file found at: ${routesPath}
Please make sure the JSON object has the following format:
{
	version: ${ROUTES_SPEC_VERSION};
	include: string[];
	exclude: string[];
}
and that at least one include rule is provided.
			`;
	}
}
