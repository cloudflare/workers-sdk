import type { FlagshipRule } from "../../api";

export type Operator =
	| "equals"
	| "not_equals"
	| "greater_than"
	| "less_than"
	| "greater_than_or_equals"
	| "less_than_or_equals"
	| "contains"
	| "starts_with"
	| "ends_with"
	| "in"
	| "not_in";

export type LogicalOperator = "AND" | "OR";

export interface BaseCondition {
	attribute: string;
	operator: Operator;
	value: unknown;
}

export interface LogicalCondition {
	logical_operator: LogicalOperator;
	clauses: Condition[];
}

export type Condition = BaseCondition | LogicalCondition;

export interface Rollout {
	percentage: number;
	attribute?: string;
}

export interface Rule {
	priority: number;
	conditions: Condition[];
	serve_variation: string;
	rollout?: Rollout;
}

/**
 * A condition as edited in the UI.
 *
 * The stored model is a tree, but a tree editor is hard to use, so the editor
 * works on a flat list instead. `join` says how a row relates to the row above
 * it: `"OR"` continues the current group, `"AND"` starts a new one. Groups are
 * OR-ed internally and AND-ed with each other, which reads as
 * "IF a OR b, AND any of c OR d".
 */
export interface UICondition {
	attribute: string;
	join: LogicalOperator;
	operator: Operator;
	value: string;
}

export interface UIRule {
	conditions: UICondition[];
	id: string;
	rollout: { attribute: string; percentage: number } | null;
	serveVariation: string;
}

export const OPERATOR_LABELS: Record<Operator, string> = {
	contains: "contains",
	ends_with: "ends with",
	equals: "equals",
	greater_than: ">",
	greater_than_or_equals: ">=",
	in: "in",
	less_than: "<",
	less_than_or_equals: "<=",
	not_equals: "does not equal",
	not_in: "not in",
	starts_with: "starts with",
};

const OPERATORS = Object.keys(OPERATOR_LABELS) as Operator[];

/** Operators whose value is a list rather than a single scalar. */
export const LIST_OPERATORS = new Set<Operator>(["in", "not_in"]);

/** Operators that compare numerically, so the input should accept numbers. */
export const NUMERIC_OPERATORS = new Set<Operator>([
	"greater_than",
	"greater_than_or_equals",
	"less_than",
	"less_than_or_equals",
]);

/**
 * Narrows a string to a known operator.
 */
export function isOperator(value: string): value is Operator {
	return (OPERATORS as string[]).includes(value);
}

/**
 * Determines whether a condition is a logical grouping rather than a comparison.
 */
function isLogical(condition: Condition): condition is LogicalCondition {
	return "logical_operator" in condition && "clauses" in condition;
}

/**
 * Renders a condition value as editable text.
 *
 * List values are newline separated so each entry can become a chip.
 */
function valueToText(value: unknown): string {
	if (Array.isArray(value)) {
		return value.map((entry) => String(entry)).join("\n");
	}
	if (value === null || value === undefined) {
		return "";
	}
	return String(value);
}

/**
 * Parses edited text back into a condition value.
 *
 * @returns An array for list operators, otherwise the trimmed text
 */
function textToValue(operator: Operator, text: string): unknown {
	if (LIST_OPERATORS.has(operator)) {
		return text
			.split("\n")
			.map((entry) => entry.trim())
			.filter((entry) => entry !== "");
	}
	return text.trim();
}

/**
 * Converts a comparison condition into an editor row.
 */
function toRow(condition: BaseCondition, join: LogicalOperator): UICondition {
	return {
		attribute: condition.attribute,
		join,
		operator: condition.operator,
		value: valueToText(condition.value),
	};
}

/**
 * Flattens a rule's stored conditions into editor rows.
 *
 * The editor can represent an AND of OR-groups, which covers everything it can
 * produce plus the shapes the Flagship API returns. Anything more deeply nested
 * is reported as unrepresentable so the caller can refuse to edit it rather than
 * silently rewriting the author's logic. An empty OR group never matches, which
 * the flat editor cannot express either, so it is treated the same way.
 *
 * @returns Editor rows, or null when the shape cannot be edited safely
 */
export function flattenConditions(
	conditions: Condition[]
): UICondition[] | null {
	// A lone AND node matches the implicit AND across the top level, so unwrap it.
	const [only] = conditions;
	const groups =
		only !== undefined &&
		conditions.length === 1 &&
		isLogical(only) &&
		only.logical_operator === "AND"
			? only.clauses
			: conditions;

	const rows: UICondition[] = [];
	for (const group of groups) {
		if (!isLogical(group)) {
			rows.push(toRow(group, "AND"));
			continue;
		}
		if (group.logical_operator !== "OR" || group.clauses.length === 0) {
			return null;
		}
		for (const [index, clause] of group.clauses.entries()) {
			if (isLogical(clause)) {
				return null;
			}
			rows.push(toRow(clause, index === 0 ? "AND" : "OR"));
		}
	}

	const [firstRow] = rows;
	if (firstRow !== undefined) {
		rows[0] = { ...firstRow, join: "AND" };
	}
	return rows;
}

/**
 * Builds stored conditions from editor rows.
 *
 * Rows joined by OR become a single OR node, and those groups are returned as
 * separate entries because the evaluator requires every top level condition to
 * match. That keeps the output free of redundant wrapper nodes.
 */
export function buildConditions(rows: UICondition[]): Condition[] {
	const groups: UICondition[][] = [];
	let group: UICondition[] | undefined;
	for (const [index, row] of rows.entries()) {
		if (index === 0 || row.join === "AND" || group === undefined) {
			group = [row];
			groups.push(group);
		} else {
			group.push(row);
		}
	}

	return groups.map((group_) => {
		const clauses = group_.map((row) => ({
			attribute: row.attribute.trim(),
			operator: row.operator,
			value: textToValue(row.operator, row.value),
		}));
		const [first] = clauses;
		if (clauses.length === 1 && first !== undefined) {
			return first;
		}
		return { clauses, logical_operator: "OR" as LogicalOperator };
	});
}

/**
 * Groups editor rows for display.
 *
 * @returns Groups of rows, each OR-ed internally
 */
export function groupRows(
	rows: UICondition[]
): Array<{ rows: UICondition[]; startIndex: number }> {
	const groups: Array<{ rows: UICondition[]; startIndex: number }> = [];
	let group: { rows: UICondition[]; startIndex: number } | undefined;
	for (const [index, row] of rows.entries()) {
		if (index === 0 || row.join === "AND" || group === undefined) {
			group = { rows: [row], startIndex: index };
			groups.push(group);
		} else {
			group.rows.push(row);
		}
	}
	return groups;
}

/**
 * Creates a blank condition row.
 */
export function emptyCondition(join: LogicalOperator): UICondition {
	return { attribute: "", join, operator: "equals", value: "" };
}

/**
 * Creates a blank rule serving the given variation.
 *
 * @returns A new editor rule with one empty condition
 */
export function emptyRule(serveVariation: string): UIRule {
	return {
		conditions: [emptyCondition("AND")],
		id: crypto.randomUUID(),
		rollout: null,
		serveVariation,
	};
}

/**
 * Converts stored rules into editor rules.
 *
 * Rules are sorted by priority because the evaluator walks them in array order,
 * so priority is what determines precedence.
 *
 * @returns Editor rules, or null when any rule's conditions cannot be edited
 */
export function uiRulesFrom(
	rules: FlagshipRule[] | undefined
): UIRule[] | null {
	const sorted = [...(rules ?? [])].sort(
		(a, b) => (a.priority ?? 0) - (b.priority ?? 0)
	);

	const uiRules: UIRule[] = [];
	for (const rule of sorted) {
		const conditions = flattenConditions(
			(rule.conditions ?? []) as unknown as Condition[]
		);
		if (conditions === null) {
			return null;
		}
		uiRules.push({
			conditions,
			id: crypto.randomUUID(),
			rollout:
				rule.rollout === undefined
					? null
					: {
							attribute: rule.rollout.attribute ?? "",
							percentage: rule.rollout.percentage ?? 100,
						},
			serveVariation: rule.serve_variation ?? "",
		});
	}
	return uiRules;
}

/**
 * Converts editor rules into stored rules.
 *
 * Priorities are renumbered from the editor's order so that the stored order,
 * the priorities, and the order shown on screen can never disagree.
 *
 * @returns Stored rules in priority order
 */
export function rulesFrom(uiRules: UIRule[]): FlagshipRule[] {
	return uiRules.map((rule, index) => ({
		// The schema types conditions as free-form objects, hence the widening.
		conditions: buildConditions(
			rule.conditions
		) as unknown as FlagshipRule["conditions"],
		priority: index + 1,
		serve_variation: rule.serveVariation,
		...(rule.rollout === null
			? {}
			: {
					rollout: {
						percentage: rule.rollout.percentage,
						...(rule.rollout.attribute.trim() === ""
							? {}
							: { attribute: rule.rollout.attribute.trim() }),
					},
				}),
	}));
}

export interface RuleError {
	/** Index of the rule at fault. */
	index: number;
	message: string;
}

/**
 * Validates editor rules against the variations they can serve.
 *
 * Mirrors the checks the local store performs, so problems are reported next to
 * the offending rule instead of arriving as a request failure.
 *
 * @returns The first problem found for each rule, in display order
 */
export function validateRules(
	uiRules: UIRule[],
	variationNames: string[]
): RuleError[] {
	const names = new Set(variationNames);
	const errors: RuleError[] = [];
	let catchAllIndex: number | null = null;

	for (const [index, rule] of uiRules.entries()) {
		/**
		 * Records a problem against the current rule, keeping only the first.
		 */
		function fail(message: string): void {
			if (errors.some((error) => error.index === index)) {
				return;
			}
			errors.push({ index, message });
		}

		if (rule.serveVariation === "" || !names.has(rule.serveVariation)) {
			fail("Choose a variant for this rule to serve.");
		}

		for (const condition of rule.conditions) {
			if (condition.attribute.trim() === "") {
				fail("Every condition needs an attribute.");
				break;
			}
			if (LIST_OPERATORS.has(condition.operator)) {
				const entries = condition.value
					.split("\n")
					.filter((entry) => entry.trim() !== "");
				if (entries.length === 0) {
					fail(
						`The '${OPERATOR_LABELS[condition.operator]}' operator needs at least one value.`
					);
					break;
				}
			} else if (condition.value.trim() === "") {
				fail("Every condition needs a value.");
				break;
			} else if (
				NUMERIC_OPERATORS.has(condition.operator) &&
				Number.isNaN(Number(condition.value.trim()))
			) {
				fail(
					`The '${OPERATOR_LABELS[condition.operator]}' operator needs a number.`
				);
				break;
			}
		}

		if (rule.rollout !== null) {
			const { percentage } = rule.rollout;
			if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
				fail("Rollout must be a number between 0 and 100.");
			}
		}

		// The evaluator stops at the first match, so a catch-all hides what follows.
		if (catchAllIndex !== null) {
			fail(
				`This rule can never match because rule ${catchAllIndex + 1} applies to everyone.`
			);
		} else if (
			rule.conditions.length === 0 &&
			(rule.rollout === null || rule.rollout.percentage === 100)
		) {
			catchAllIndex = index;
		}
	}

	return errors;
}
