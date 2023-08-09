import { logger } from "../logger";
import type { Rule } from "../config/environment";

export function isJavaScriptModuleRule(rule: Rule) {
	return rule.type === "ESModule" || rule.type === "CommonJS";
}

export const DEFAULT_MODULE_RULES: Rule[] = [
	{ type: "Text", globs: ["**/*.txt", "**/*.html"] },
	{ type: "Data", globs: ["**/*.bin"] },
	{ type: "CompiledWasm", globs: ["**/*.wasm", "**/*.wasm?module"] },
];

export interface ParsedRules {
	rules: Rule[];
	removedRules: Rule[];
}

export function parseRules(userRules: Rule[] = []): ParsedRules {
	const rules: Rule[] = [...userRules, ...DEFAULT_MODULE_RULES];

	const completedRuleLocations: Record<string, number> = {};
	let index = 0;
	const rulesToRemove: Rule[] = [];
	for (const rule of rules) {
		if (rule.type in completedRuleLocations) {
			if (rules[completedRuleLocations[rule.type]].fallthrough !== false) {
				if (index < userRules.length) {
					logger.warn(
						`The module rule at position ${index} (${JSON.stringify(
							rule
						)}) has the same type as a previous rule (at position ${
							completedRuleLocations[rule.type]
						}, ${JSON.stringify(
							rules[completedRuleLocations[rule.type]]
						)}). This rule will be ignored. To the previous rule, add \`fallthrough = true\` to allow this one to also be used, or \`fallthrough = false\` to silence this warning.`
					);
				} else {
					logger.warn(
						`The default module rule ${JSON.stringify(
							rule
						)} has the same type as a previous rule (at position ${
							completedRuleLocations[rule.type]
						}, ${JSON.stringify(
							rules[completedRuleLocations[rule.type]]
						)}). This rule will be ignored. To the previous rule, add \`fallthrough = true\` to allow the default one to also be used, or \`fallthrough = false\` to silence this warning.`
					);
				}
			}

			rulesToRemove.push(rule);
		}
		if (!(rule.type in completedRuleLocations) && rule.fallthrough !== true) {
			completedRuleLocations[rule.type] = index;
		}
		index++;
	}

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	rulesToRemove.forEach((rule) => rules!.splice(rules!.indexOf(rule), 1));

	return { rules, removedRules: rulesToRemove };
}
