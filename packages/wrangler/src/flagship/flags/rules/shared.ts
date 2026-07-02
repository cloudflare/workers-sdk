import { UserError } from "@cloudflare/workers-utils";
import { formatValue } from "../../render";
import type { Condition, Rule } from "../../client";

export function findRule(rules: Rule[], priority: number): Rule {
	const rule = rules.find((candidate) => candidate.priority === priority);
	if (!rule) {
		throw new UserError(
			`No rule with priority ${priority}. Available priorities: ${formatPriorities(rules)}.`,
			{ telemetryMessage: "flagship rule priority not found" }
		);
	}
	return rule;
}

export function withoutRule(rules: Rule[], priority: number): Rule[] {
	findRule(rules, priority);
	return sortedRules(rules)
		.filter((rule) => rule.priority !== priority)
		.map((rule, index) => ({ ...rule, priority: index + 1 }));
}

export function sortedRules(rules: Rule[]): Rule[] {
	return [...rules].sort((a, b) => a.priority - b.priority);
}

export function stringifyConditions(conditions: Condition[]): string {
	if (conditions.length === 0) {
		return "always";
	}
	return conditions.map(stringifyCondition).join(" AND ");
}

export function stringifyRollout(rule: Rule): string {
	if (!rule.rollout) {
		return "";
	}
	return rule.rollout.attribute
		? `${rule.rollout.percentage}%@${rule.rollout.attribute}`
		: `${rule.rollout.percentage}%`;
}

function stringifyCondition(condition: Condition): string {
	if ("logical_operator" in condition) {
		return `(${condition.clauses.map(stringifyCondition).join(` ${condition.logical_operator} `)})`;
	}
	return `${condition.attribute} ${condition.operator} ${formatValue(condition.value)}`;
}

function formatPriorities(rules: Rule[]): string {
	const priorities = sortedRules(rules).map((rule) => String(rule.priority));
	return priorities.length > 0 ? priorities.join(", ") : "(none)";
}
