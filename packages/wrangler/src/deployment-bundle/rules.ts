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

interface RedundantRule {
	index: number;
	default: boolean;
}

export function parseRules(userRules: Rule[] = []): ParsedRules {
	const rules: Rule[] = [...userRules, ...DEFAULT_MODULE_RULES];

	const completedRuleLocations: Record<string, number> = {};
	const redudantRules: Record<string, RedundantRule[]> = {};
	let index = 0;
	const rulesToRemove: Rule[] = [];
	for (const rule of rules) {
		if (rule.type in completedRuleLocations) {
			if (rules[completedRuleLocations[rule.type]].fallthrough !== false) {
				if (rule.type in redudantRules) {
					redudantRules[rule.type].push({
						index,
						default: index >= userRules.length,
					});
				} else {
					redudantRules[rule.type] = [
						{ index, default: index >= userRules.length },
					];
				}
			}

			rulesToRemove.push(rule);
		}
		if (!(rule.type in completedRuleLocations) && rule.fallthrough !== true) {
			completedRuleLocations[rule.type] = index;
		}
		index++;
	}

	for (const completedRuleType in completedRuleLocations) {
		const r = redudantRules[completedRuleType];
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

			warning += `\n\nAdd \`fallthrough = true\` to rule to allow next rule to be used or \`fallthrough = false\` to slience this warning`;

			logger.warn(warning);
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	rulesToRemove.forEach((rule) => rules!.splice(rules!.indexOf(rule), 1));

	return { rules, removedRules: rulesToRemove };
}
