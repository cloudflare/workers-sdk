import { describe, test } from "vitest";
import {
	buildConditions,
	flattenConditions,
	rulesFrom,
	uiRulesFrom,
	validateRules,
	type Condition,
	type UICondition,
	type UIRule,
} from "../../components/flagship/rule-helpers";

function row(
	attribute: string,
	join: "AND" | "OR" = "AND",
	value = "x"
): UICondition {
	return { attribute, join, operator: "equals", value };
}

function rule(patch: Partial<UIRule> = {}): UIRule {
	return {
		conditions: [row("country")],
		id: "rule",
		rollout: null,
		serveVariation: "on",
		...patch,
	};
}

function show(condition: Condition): string {
	return "logical_operator" in condition
		? `(${condition.clauses.map(show).join(` ${condition.logical_operator} `)})`
		: condition.attribute;
}

describe("condition conversion", () => {
	test("builds and round-trips ANDs of OR groups", ({ expect }) => {
		const rows = [row("a"), row("b", "OR"), row("c"), row("d", "OR")];
		const built = buildConditions(rows);
		expect(built.map(show).join(" AND ")).toBe("(a OR b) AND (c OR d)");
		expect(flattenConditions(built)).toEqual(rows);
	});

	test("keeps simple conditions unwrapped and converts list values", ({
		expect,
	}) => {
		expect(buildConditions([row("country")])).toEqual([
			{ attribute: "country", operator: "equals", value: "x" },
		]);
		expect(
			buildConditions([
				{ attribute: "country", join: "AND", operator: "in", value: "NZ\nAU" },
			])
		).toEqual([{ attribute: "country", operator: "in", value: ["NZ", "AU"] }]);
		expect(
			flattenConditions([
				{ attribute: "country", operator: "in", value: ["NZ", "AU"] },
			])
		).toEqual([
			{ attribute: "country", join: "AND", operator: "in", value: "NZ\nAU" },
		]);
	});

	test("unwraps API AND nodes", ({ expect }) => {
		expect(
			flattenConditions([
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
			])
		).toEqual([row("a"), row("b"), row("c", "OR")]);
	});

	test("refuses unrepresentable conditions", ({ expect }) => {
		const cases: Condition[][] = [
			[
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
			[{ clauses: [], logical_operator: "OR" }],
		];
		for (const conditions of cases) {
			expect(flattenConditions(conditions)).toBeNull();
		}
	});
});

describe("rule conversion", () => {
	test("sorts incoming rules and renumbers edited rules", ({ expect }) => {
		const uiRules = uiRulesFrom([
			{ conditions: [], priority: 2, serve_variation: "second" },
			{ conditions: [], priority: 1, serve_variation: "first" },
		]);
		expect(uiRules?.map(({ serveVariation }) => serveVariation)).toEqual([
			"first",
			"second",
		]);
		expect(rulesFrom(uiRules ?? []).map(({ priority }) => priority)).toEqual([
			1, 2,
		]);
	});

	test("round-trips rollout fields in canonical form", ({ expect }) => {
		const uiRules = uiRulesFrom([
			{
				conditions: [],
				priority: 1,
				rollout: { percentage: 25 },
				serve_variation: "on",
			},
		]);
		expect(uiRules?.[0]?.rollout).toEqual({ attribute: "", percentage: 25 });
		expect(rulesFrom(uiRules ?? [])[0]?.rollout).toEqual({ percentage: 25 });
	});

	test("preserves canonical serialization for unchanged rules", ({
		expect,
	}) => {
		const stored = [
			{
				priority: 1,
				conditions: [],
				serve_variation: "on",
				rollout: { percentage: 25 },
			},
		];
		const canonical = [
			{
				conditions: [],
				priority: 1,
				serve_variation: "on",
				rollout: { percentage: 25 },
			},
		];
		expect(JSON.stringify(rulesFrom(uiRulesFrom(stored) ?? []))).toBe(
			JSON.stringify(canonical)
		);
	});

	test("refuses rules containing unrepresentable conditions", ({ expect }) => {
		const conditions = [
			{
				clauses: [
					{
						clauses: [{ attribute: "a", operator: "equals", value: "x" }],
						logical_operator: "AND",
					},
				],
				logical_operator: "OR",
			},
		];
		expect(
			uiRulesFrom([{ conditions, priority: 1, serve_variation: "on" }])
		).toBeNull();
	});
});

describe("validateRules", () => {
	test("accepts valid fractional and partial rollouts", ({ expect }) => {
		expect(
			validateRules(
				[
					rule({
						conditions: [],
						rollout: { attribute: "", percentage: 33.5 },
					}),
					rule({ id: "next", serveVariation: "off" }),
				],
				["on", "off"]
			)
		).toEqual([]);
	});

	test("reports invalid rule input", ({ expect }) => {
		const cases: Array<[UIRule, string]> = [
			[
				rule({ serveVariation: "gone" }),
				"Choose a variant for this rule to serve.",
			],
			[rule({ conditions: [row("")] }), "Every condition needs an attribute."],
			[
				rule({
					conditions: [
						{
							attribute: "age",
							join: "AND",
							operator: "greater_than",
							value: "old",
						},
					],
				}),
				"The '>' operator needs a number.",
			],
			[
				rule({
					conditions: [
						{ attribute: "country", join: "AND", operator: "in", value: "" },
					],
				}),
				"The 'in' operator needs at least one value.",
			],
			[
				rule({ rollout: { attribute: "", percentage: 140 } }),
				"Rollout must be a number between 0 and 100.",
			],
		];
		for (const [invalid, message] of cases) {
			expect(validateRules([invalid], ["on"])[0]?.message).toBe(message);
		}
	});

	test("reports rules hidden by a catch-all", ({ expect }) => {
		expect(
			validateRules(
				[
					rule({ conditions: [] }),
					rule({ id: "hidden", serveVariation: "off" }),
				],
				["on", "off"]
			)
		).toEqual([
			{
				index: 1,
				message:
					"This rule can never match because rule 1 applies to everyone.",
			},
		]);
	});
});
