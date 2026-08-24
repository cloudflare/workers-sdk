import { describe, test } from "vitest";
import {
	buildConditions,
	flattenConditions,
	rulesFrom,
	uiRulesFrom,
	validateRules,
	type Condition,
	type UICondition,
} from "../../components/flagship/rule-helpers";

/**
 * Builds an editor row, defaulting the parts a test does not care about.
 *
 * @param attribute - Context attribute to compare
 * @param join - How the row joins to the row above it
 * @param value - Value to compare against
 *
 * @returns The editor row
 */
function row(
	attribute: string,
	join: "AND" | "OR" = "AND",
	value = "x"
): UICondition {
	return { attribute, join, operator: "equals", value };
}

/**
 * Renders a condition tree as a readable string.
 *
 * @param condition - Condition to render
 *
 * @returns A parenthesised expression
 */
function show(condition: Condition): string {
	if ("logical_operator" in condition) {
		return `(${condition.clauses.map(show).join(` ${condition.logical_operator} `)})`;
	}
	return condition.attribute;
}

/**
 * Renders built conditions the way the evaluator reads them, as an implicit AND
 * across the top level array.
 *
 * @param conditions - Conditions to render
 *
 * @returns A parenthesised expression
 */
function showAll(conditions: Condition[]): string {
	return conditions.map(show).join(" AND ");
}

describe("buildConditions", () => {
	test("no rows produce a catch-all rule", ({ expect }) => {
		expect(buildConditions([])).toEqual([]);
	});

	test("a single row is stored without a wrapper node", ({ expect }) => {
		expect(buildConditions([row("country")])).toEqual([
			{ attribute: "country", operator: "equals", value: "x" },
		]);
	});

	test("rows joined by AND become separate top level conditions", ({
		expect,
	}) => {
		const built = buildConditions([row("a"), row("b", "AND")]);

		expect(showAll(built)).toBe("a AND b");
		expect(built).toHaveLength(2);
	});

	test("rows joined by OR become one OR node", ({ expect }) => {
		const built = buildConditions([row("a"), row("b", "OR")]);

		expect(showAll(built)).toBe("(a OR b)");
		expect(built).toHaveLength(1);
	});

	test("mixed joins group ORs and AND the groups together", ({ expect }) => {
		const built = buildConditions([
			row("a"),
			row("b", "OR"),
			row("c", "AND"),
			row("d", "OR"),
		]);

		expect(showAll(built)).toBe("(a OR b) AND (c OR d)");
	});

	test("list operators split their value into an array", ({ expect }) => {
		const built = buildConditions([
			{ attribute: "country", join: "AND", operator: "in", value: "NZ\nAU" },
		]);

		expect(built).toEqual([
			{ attribute: "country", operator: "in", value: ["NZ", "AU"] },
		]);
	});
});

describe("flattenConditions", () => {
	test("round-trips an AND of OR groups", ({ expect }) => {
		const rows = [row("a"), row("b", "OR"), row("c", "AND"), row("d", "OR")];

		expect(flattenConditions(buildConditions(rows))).toEqual(rows);
	});

	test("round-trips a single condition", ({ expect }) => {
		const rows = [row("a")];

		expect(flattenConditions(buildConditions(rows))).toEqual(rows);
	});

	test("unwraps a top level AND node, as returned by the API", ({ expect }) => {
		const flattened = flattenConditions([
			{
				clauses: [
					{ attribute: "a", operator: "equals", value: "x" },
					{
						clauses: [
							{ attribute: "b", operator: "equals", value: "x" },
							{ attribute: "c", operator: "equals", value: "x" },
						],
						logical_operator: "OR",
					},
				],
				logical_operator: "AND",
			},
		]);

		expect(flattened).toEqual([row("a"), row("b"), row("c", "OR")]);
	});

	test("reads a list operator value back as newline separated text", ({
		expect,
	}) => {
		const flattened = flattenConditions([
			{ attribute: "country", operator: "in", value: ["NZ", "AU"] },
		]);

		expect(flattened).toEqual([
			{ attribute: "country", join: "AND", operator: "in", value: "NZ\nAU" },
		]);
	});

	test("refuses nesting it cannot represent", ({ expect }) => {
		const flattened = flattenConditions([
			{
				clauses: [
					{
						clauses: [{ attribute: "a", operator: "equals", value: "x" }],
						logical_operator: "AND",
					},
				],
				logical_operator: "OR",
			},
		]);

		expect(flattened).toBeNull();
	});

	test("refuses an OR group with no clauses", ({ expect }) => {
		const flattened = flattenConditions([
			{ clauses: [], logical_operator: "OR" },
		]);

		expect(flattened).toBeNull();
	});
});

describe("uiRulesFrom", () => {
	test("orders rules by priority rather than array order", ({ expect }) => {
		const uiRules = uiRulesFrom([
			{ conditions: [], priority: 2, serve_variation: "second" },
			{ conditions: [], priority: 1, serve_variation: "first" },
		]);

		expect(uiRules?.map((rule) => rule.serveVariation)).toEqual([
			"first",
			"second",
		]);
	});

	test("reads a rollout, defaulting a missing attribute to empty", ({
		expect,
	}) => {
		const uiRules = uiRulesFrom([
			{
				conditions: [],
				priority: 1,
				rollout: { percentage: 25 },
				serve_variation: "on",
			},
		]);

		expect(uiRules?.[0]?.rollout).toEqual({ attribute: "", percentage: 25 });
	});

	test("refuses a flag whose conditions cannot be edited", ({ expect }) => {
		const uiRules = uiRulesFrom([
			{
				conditions: [
					{
						clauses: [
							{
								clauses: [{ attribute: "a", operator: "equals", value: "x" }],
								logical_operator: "AND",
							},
						],
						logical_operator: "OR",
					},
				],
				priority: 1,
				serve_variation: "on",
			},
		]);

		expect(uiRules).toBeNull();
	});
});

describe("rulesFrom", () => {
	test("renumbers priorities from the editor order", ({ expect }) => {
		const rules = rulesFrom([
			{ conditions: [], id: "a", rollout: null, serveVariation: "one" },
			{ conditions: [], id: "b", rollout: null, serveVariation: "two" },
		]);

		expect(rules.map((rule) => rule.priority)).toEqual([1, 2]);
	});

	test("omits a rollout attribute that is only whitespace", ({ expect }) => {
		const [rule] = rulesFrom([
			{
				conditions: [],
				id: "a",
				rollout: { attribute: "   ", percentage: 50 },
				serveVariation: "on",
			},
		]);

		expect(rule?.rollout).toEqual({ percentage: 50 });
	});
});

describe("rulesFrom", () => {
	test("uses canonical property order after an editor round trip", ({
		expect,
	}) => {
		const stored = [
			{
				priority: 1,
				conditions: [],
				serve_variation: "on",
				rollout: { percentage: 50 },
			},
		];
		const editor = [
			{
				conditions: [],
				priority: 1,
				serve_variation: "on",
				rollout: { percentage: 50 },
			},
		];

		const uiRules = uiRulesFrom(stored);
		expect(uiRules).not.toBeNull();
		expect(JSON.stringify(rulesFrom(uiRules ?? []))).toBe(
			JSON.stringify(editor)
		);
	});
});

describe("validateRules", () => {
	test("accepts a well formed rule", ({ expect }) => {
		const errors = validateRules(
			[
				{
					conditions: [row("country")],
					id: "a",
					rollout: null,
					serveVariation: "on",
				},
			],
			["on", "off"]
		);

		expect(errors).toEqual([]);
	});

	test("rejects a rule serving an unknown variant", ({ expect }) => {
		const errors = validateRules(
			[
				{
					conditions: [row("country")],
					id: "a",
					rollout: null,
					serveVariation: "gone",
				},
			],
			["on", "off"]
		);

		expect(errors).toEqual([
			{ index: 0, message: "Choose a variant for this rule to serve." },
		]);
	});

	test("rejects a condition with no attribute", ({ expect }) => {
		const errors = validateRules(
			[
				{
					conditions: [row("")],
					id: "a",
					rollout: null,
					serveVariation: "on",
				},
			],
			["on"]
		);

		expect(errors[0]?.message).toBe("Every condition needs an attribute.");
	});

	test("rejects a non-numeric value for a numeric operator", ({ expect }) => {
		const errors = validateRules(
			[
				{
					conditions: [
						{
							attribute: "age",
							join: "AND",
							operator: "greater_than",
							value: "old",
						},
					],
					id: "a",
					rollout: null,
					serveVariation: "on",
				},
			],
			["on"]
		);

		expect(errors[0]?.message).toBe("The '>' operator needs a number.");
	});

	test("rejects an empty list for the in operator", ({ expect }) => {
		const errors = validateRules(
			[
				{
					conditions: [
						{ attribute: "country", join: "AND", operator: "in", value: "" },
					],
					id: "a",
					rollout: null,
					serveVariation: "on",
				},
			],
			["on"]
		);

		expect(errors[0]?.message).toBe(
			"The 'in' operator needs at least one value."
		);
	});

	test("rejects a rollout outside 0 to 100", ({ expect }) => {
		const errors = validateRules(
			[
				{
					conditions: [row("country")],
					id: "a",
					rollout: { attribute: "", percentage: 140 },
					serveVariation: "on",
				},
			],
			["on"]
		);

		expect(errors[0]?.message).toBe(
			"Rollout must be a number between 0 and 100."
		);
	});

	test("rejects a rollout that is not a finite number", ({ expect }) => {
		const errors = validateRules(
			[
				{
					conditions: [row("country")],
					id: "a",
					rollout: { attribute: "", percentage: Number.NaN },
					serveVariation: "on",
				},
			],
			["on"]
		);

		expect(errors[0]?.message).toBe(
			"Rollout must be a number between 0 and 100."
		);
	});

	test("accepts a fractional rollout", ({ expect }) => {
		const errors = validateRules(
			[
				{
					conditions: [row("country")],
					id: "a",
					rollout: { attribute: "", percentage: 33.5 },
					serveVariation: "on",
				},
			],
			["on"]
		);

		expect(errors).toEqual([]);
	});

	test("allows rules after a partial conditionless rollout", ({ expect }) => {
		const errors = validateRules(
			[
				{
					conditions: [],
					id: "a",
					rollout: { attribute: "", percentage: 50 },
					serveVariation: "on",
				},
				{
					conditions: [row("country")],
					id: "b",
					rollout: null,
					serveVariation: "off",
				},
			],
			["on", "off"]
		);

		expect(errors).toEqual([]);
	});

	test("reports rules made unreachable by an earlier catch-all", ({
		expect,
	}) => {
		const errors = validateRules(
			[
				{ conditions: [], id: "a", rollout: null, serveVariation: "on" },
				{
					conditions: [row("country")],
					id: "b",
					rollout: null,
					serveVariation: "off",
				},
			],
			["on", "off"]
		);

		expect(errors).toEqual([
			{
				index: 1,
				message:
					"This rule can never match because rule 1 applies to everyone.",
			},
		]);
	});
});
