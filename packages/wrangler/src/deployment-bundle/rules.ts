import { logger } from "../logger";
import type { Rule } from "@cloudflare/workers-utils";

export function isJavaScriptModuleRule(rule: Rule) {
	return rule.type === "ESModule" || rule.type === "CommonJS";
}

export const DEFAULT_MODULE_RULES: Rule[] = [
	{ type: "Text", globs: ["**/*.txt", "**/*.html", "**/*.sql"] },
	{ type: "Data", globs: ["**/*.bin"] },
	{ type: "CompiledWasm", globs: ["**/*.wasm", "**/*.wasm?module"] },
];

export interface ParsedRules {
	rules: Rule[];
	removedRules: Rule[];
	// Default rules removed because a user rule of the same type was explicitly
	// marked `fallthrough: false`. Files matching only these rules are silently
	// skipped instead of erroring, since the user intentionally opted out of the
	// remaining defaults for that type.
	silentlyRemovedRules: Rule[];
}

interface RedundantRule {
	index: number;
	default: boolean;
}

export function parseRules(userRules: Rule[] = []): ParsedRules {
	const rules: Rule[] = [...userRules, ...DEFAULT_MODULE_RULES];

	const completedRuleLocations: Record<string, number> = {};
	const redundantRules: Record<string, RedundantRule[]> = {};
	let index = 0;
	const rulesToRemove: Rule[] = [];
	const rulesToSilentlyRemove: Rule[] = [];
	for (const rule of rules) {
		if (rule.type in completedRuleLocations) {
			const isDefaultRule = index >= userRules.length;
			const completingRuleHasExplicitNoFallthrough =
				rules[completedRuleLocations[rule.type]].fallthrough === false;

			// When a user marks their rule `fallthrough: false`, they've declared it
			// the final rule for that type. A *default* rule shadowed by it should be
			// dropped silently — the user opted out of those defaults on purpose. A
			// user's own subsequent rule that gets shadowed still warns/errors, since
			// that's likely a misconfiguration worth surfacing.
			if (completingRuleHasExplicitNoFallthrough && isDefaultRule) {
				rulesToSilentlyRemove.push(rule);
			} else {
				if (rules[completedRuleLocations[rule.type]].fallthrough !== false) {
					if (rule.type in redundantRules) {
						redundantRules[rule.type].push({
							index,
							default: isDefaultRule,
						});
					} else {
						redundantRules[rule.type] = [{ index, default: isDefaultRule }];
					}
				}

				rulesToRemove.push(rule);
			}
		}
		if (!(rule.type in completedRuleLocations) && rule.fallthrough !== true) {
			completedRuleLocations[rule.type] = index;
		}
		index++;
	}

	for (const completedRuleType in completedRuleLocations) {
		const r = redundantRules[completedRuleType];
		if (r) {
			const completedRuleIndex = completedRuleLocations[completedRuleType];
			let warning = `The ${
				completedRuleIndex >= userRules.length ? "default " : ""
			}module rule ${JSON.stringify(
				rules[completedRuleIndex]
			)} does not have a fallback, the following rules will be ignored:`;

			for (const rule of r) {
				warning += `\n ${JSON.stringify(rules[rule.index])}${
					rule.default ? " (DEFAULT)" : ""
				}`;
			}

			warning += `\n\nAdd \`fallthrough = true\` to rule to allow next rule to be used or \`fallthrough = false\` to silence this warning`;

			logger.warn(warning);
		}
	}

	rulesToRemove.forEach((rule) => rules.splice(rules.indexOf(rule), 1));
	rulesToSilentlyRemove.forEach((rule) => rules.splice(rules.indexOf(rule), 1));

	return {
		rules,
		removedRules: rulesToRemove,
		silentlyRemovedRules: rulesToSilentlyRemove,
	};
}
