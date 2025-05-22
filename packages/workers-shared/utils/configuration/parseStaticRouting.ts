import { StaticRoutingSchema } from "../types";
import {
	MAX_ROUTES_DESCRIPTION_LENGTH,
	MAX_ROUTES_RULE_LENGTH,
	MAX_ROUTES_RULES,
	ROUTES_SPEC_VERSION,
} from "./constants";
import type { StaticRouting } from "../types";

export function parseStaticRouting(input: string) {
	const parsed = StaticRoutingSchema.parse(JSON.parse(input)) as StaticRouting;

	if (parsed.version !== ROUTES_SPEC_VERSION) {
		throw new Error(
			`Unsupported schema version ${parsed.version}; valid schema versions: ${ROUTES_SPEC_VERSION}`
		);
	}

	if (parsed.include.length === 0) {
		if (parsed.exclude && parsed.exclude.length === 0) {
			throw new Error(
				"No rules were provided; must provide at least 1 include rule"
			);
		} else {
			throw new Error(
				"Only exclude rules were provided; must provide at least 1 include rule"
			);
		}
	}

	if (
		parsed.description &&
		parsed.description.length > MAX_ROUTES_DESCRIPTION_LENGTH
	) {
		throw new Error(
			`Description is invalid; must be less than ${MAX_ROUTES_DESCRIPTION_LENGTH} characters`
		);
	}

	if (
		parsed.include.length + (parsed.exclude?.length ?? 0) >
		MAX_ROUTES_RULES
	) {
		throw new Error(
			`Too many rules were provided; ${
				parsed.include.length + (parsed.exclude?.length ?? 0)
			} rules provided exceeds max of ${MAX_ROUTES_RULES}`
		);
	}

	const invalidIncludes = validateStaticRoutingRules(parsed.include);
	const invalidExcludes = validateStaticRoutingRules(parsed.exclude ?? []);

	const errorMessage = formatInvalidRoutes(invalidIncludes, invalidExcludes);
	if (errorMessage) {
		throw new Error(errorMessage);
	}
	return parsed;
}

function validateStaticRoutingRules(rules: string[]): string[] {
	const invalid = [];
	const seenRules = new Set<string>();
	for (const rule of rules) {
		if (!rule.startsWith("/")) {
			invalid.push(`Rule '${rule}' is invalid; all rules must begin with '/'`);
		}
		if (rule.length > MAX_ROUTES_RULE_LENGTH) {
			invalid.push(
				`Rule '${rule}' is invalid; all rules must be less than ${MAX_ROUTES_RULE_LENGTH} characters in length`
			);
		}
		if (seenRules.has(rule)) {
			invalid.push(`Rule '${rule}' is a duplicate; rules must be unique`);
		}
		if (rule.endsWith("*")) {
			// Check for redundant rules due to a glob
			for (const otherRule of rules) {
				if (otherRule !== rule && otherRule.startsWith(rule.slice(0, -1))) {
					invalid.push(
						`Rule '${otherRule}' is invalid; rule '${rule}' makes it redundant`
					);
				}
			}
		}
		seenRules.add(rule);
	}
	return invalid;
}

const formatInvalidRoutes = (
	invalidIncludes: string[],
	invalidExcludes: string[]
) => {
	const logInvalidRules: string[] = [];
	if (invalidIncludes.length) {
		logInvalidRules.push(
			["Invalid include rules:", ...invalidIncludes].join("\n")
		);
	}
	if (invalidExcludes.length) {
		logInvalidRules.push(
			["Invalid exclude rules:", ...invalidExcludes].join("\n")
		);
	}

	if (logInvalidRules.length) {
		return (
			`Invalid routes in _routes.json found\n` + logInvalidRules.join("\n\n")
		);
	}
};
