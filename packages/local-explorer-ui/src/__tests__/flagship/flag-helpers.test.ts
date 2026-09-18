import { describe, test } from "vitest";
import {
	buildRuleConditions,
	canonicalRules,
	defaultServeToRules,
	inferDefaultServe,
	parseContextValue,
	parseVariationValue,
	ruleDraftsFrom,
	ruleDraftsToRules,
	sanitizeVariationName,
	validateDefaultServe,
	validateFlagKey,
	validateRuleDrafts,
} from "../../components/flagship/flag-helpers";
import type { FlagshipRule } from "../../api";
import type { VariationDraft } from "../../components/flagship/flag-helpers";

function first<T>(values: T[]): T {
	const [value] = values;
	if (value === undefined) {
		throw new Error("Expected a value");
	}
	return value;
}

describe("validateFlagKey", () => {
	test("validates syntax and length", ({ expect }) => {
		const cases: Array<[string, string | null]> = [
			["new_ui-2", null],
			["   ", "Enter a flag key."],
			["new ui", "Use only letters, numbers, hyphens, and underscores."],
			["a".repeat(65), "Flag key must be 64 characters or fewer."],
		];
		for (const [key, error] of cases) {
			expect(validateFlagKey(key, new Set())).toBe(error);
		}
	});

	test("checks duplicates case-sensitively", ({ expect }) => {
		const existing = new Set(["new-ui"]);
		expect(validateFlagKey("new-ui", existing)).toContain("already exists");
		expect(validateFlagKey("New-UI", existing)).toBeNull();
	});
});

describe("parseVariationValue", () => {
	test("rejects non-finite numbers", ({ expect }) => {
		for (const value of ["Infinity", "NaN", ""]) {
			expect(parseVariationValue("number", value).ok).toBe(false);
		}
	});

	test("parses finite numbers and structured JSON", ({ expect }) => {
		expect(parseVariationValue("number", "33.5")).toEqual({
			ok: true,
			value: 33.5,
		});
		expect(parseVariationValue("json", '[{"enabled":true}]')).toEqual({
			ok: true,
			value: [{ enabled: true }],
		});
	});

	test("rejects JSON primitives", ({ expect }) => {
		for (const value of ["null", "true", "1", '"value"']) {
			expect(parseVariationValue("json", value).ok).toBe(false);
		}
	});
});

describe("rule drafts", () => {
	const variationIdByName = new Map([["on", "variation-on"]]);
	const variationNameById = new Map([["variation-on", "on"]]);
	const rules: FlagshipRule[] = [
		{
			conditions: [
				{
					clauses: [
						{ attribute: "plan", operator: "equals", value: "pro" },
						{ attribute: "country", operator: "in", value: ["NZ", "AU"] },
					],
					logical_operator: "OR",
				},
			],
			priority: 4,
			serve_variation: "on",
		},
	];

	test("round-trips untouched conditions and normalizes priorities", ({
		expect,
	}) => {
		const drafts = ruleDraftsFrom(rules, variationIdByName);
		expect(ruleDraftsToRules(drafts, variationNameById)).toEqual([
			{ ...first(rules), rollout: undefined },
		]);
	});

	test("builds AND groups containing OR conditions", ({ expect }) => {
		const draft = first(ruleDraftsFrom(rules, variationIdByName));
		const firstCondition = first(draft.conditions);
		expect(
			buildRuleConditions([
				firstCondition,
				{
					...firstCondition,
					attribute: "region",
					id: "or",
					joinOperator: "OR",
					value: "APAC",
				},
				{
					...firstCondition,
					attribute: "account",
					id: "and",
					joinOperator: "AND",
					value: "paid",
				},
			])
		).toEqual([
			{
				clauses: [
					{
						clauses: [
							{ attribute: "plan", operator: "equals", value: "pro" },
							{ attribute: "region", operator: "equals", value: "APAC" },
						],
						logical_operator: "OR",
					},
					{ attribute: "account", operator: "equals", value: "paid" },
				],
				logical_operator: "AND",
			},
		]);
	});

	test("validates required fields and rollout bounds", ({ expect }) => {
		const draft = first(ruleDraftsFrom(rules, variationIdByName));
		expect(validateRuleDrafts([draft], new Set(["variation-on"]))).toBeNull();
		expect(
			validateRuleDrafts(
				[
					{
						...draft,
						rollout: {
							attribute: "",
							attributeEdited: false,
							percentage: "101",
						},
					},
				],
				new Set(["variation-on"])
			)
		).toContain("between 0 and 100");
		expect(
			validateRuleDrafts(
				[
					{
						...draft,
						conditions: [{ ...first(draft.conditions), attribute: "" }],
					},
				],
				new Set(["variation-on"])
			)
		).toContain("without an attribute");
		const catchAll = { ...draft, conditions: [] };
		expect(
			validateRuleDrafts([catchAll, draft], new Set(["variation-on"]))
		).toContain("must be last");
		expect(
			validateRuleDrafts([catchAll], new Set(["variation-on"]))
		).toBeNull();
		expect(
			validateRuleDrafts([catchAll], new Set(["variation-on"]), true)
		).toContain("never be reached");
		const partialRollout = {
			...catchAll,
			rollout: { attribute: "", attributeEdited: false, percentage: "10" },
		};
		expect(
			validateRuleDrafts([partialRollout], new Set(["variation-on"]), true)
		).toBeNull();
	});

	test("preserves unsupported nested conditions instead of flattening them", ({
		expect,
	}) => {
		const nested: FlagshipRule = {
			conditions: [
				{
					clauses: [
						{
							clauses: [
								{ attribute: "plan", operator: "equals", value: "pro" },
								{ attribute: "region", operator: "equals", value: "EU" },
							],
							logical_operator: "AND",
						},
						{ attribute: "beta", operator: "equals", value: true },
					],
					logical_operator: "OR",
				},
			],
			priority: 9,
			serve_variation: "on",
		};
		const draft = first(ruleDraftsFrom([nested], variationIdByName));
		expect(draft.conditionsEditable).toBe(false);
		expect(
			validateRuleDrafts([draft, draft], new Set(["variation-on"]), true)
		).toBeNull();
		expect(ruleDraftsToRules([draft], variationNameById)).toEqual([
			{ ...nested, rollout: undefined },
		]);
	});

	test("keeps a lone catch-all rule out of the percentage split", ({
		expect,
	}) => {
		const variations: VariationDraft[] = [
			{ id: "a", name: "on", value: "true" },
		];
		const catchAll: FlagshipRule[] = [
			{ conditions: [], priority: 1, serve_variation: "on" },
		];
		const { defaultServe, targetingRules } = inferDefaultServe(
			catchAll,
			"a",
			variations,
			variationIdByName
		);
		expect(defaultServe.mode).toBe("variation");
		expect(targetingRules).toEqual(catchAll);
	});

	test("preserves typed and comma-containing condition values", ({
		expect,
	}) => {
		const typedRules: FlagshipRule[] = [
			{
				conditions: [
					{ attribute: "age", operator: "greater_than", value: 21 },
					{ attribute: "segment", operator: "in", value: ["a,b", "c"] },
				],
				priority: 3,
				rollout: { attribute: " userId ", percentage: 50 },
				serve_variation: "on",
			},
		];
		const drafts = ruleDraftsFrom(typedRules, variationIdByName);
		expect(ruleDraftsToRules(drafts, variationNameById)).toEqual([
			first(typedRules),
		]);

		const draft = first(drafts);
		const listCondition = first(
			draft.conditions.filter((condition) => condition.operator === "in")
		);
		const edited = {
			...draft,
			conditions: draft.conditions.map((condition) =>
				condition.operator === "greater_than"
					? { ...condition, value: "22", valueEdited: true }
					: condition.id === listCondition.id
						? { ...condition, value: `${condition.value}\nd` }
						: condition
			),
		};
		expect(
			ruleDraftsToRules([edited], variationNameById)[0]?.conditions
		).toEqual([
			{
				clauses: [
					{ attribute: "age", operator: "greater_than", value: 22 },
					{
						attribute: "segment",
						operator: "in",
						value: ["a,b", "c", "d"],
					},
				],
				logical_operator: "AND",
			},
		]);
	});
});

describe("percentage split", () => {
	const variations: VariationDraft[] = [
		{ id: "a", name: "control", value: "false" },
		{ id: "b", name: "treatment", value: "true" },
		{ id: "c", name: "holdback", value: "false" },
	];
	const nameById = new Map(variations.map((row) => [row.id, row.name]));
	const idByName = new Map(variations.map((row) => [row.name, row.id]));

	test("encodes a two-way split as a single rule against the default", ({
		expect,
	}) => {
		const rules = defaultServeToRules(
			{
				mode: "percentage",
				splits: [
					{ variationId: "a", weight: "70" },
					{ variationId: "b", weight: "30" },
					{ variationId: "c", weight: "0" },
				],
				targetingKey: "userId",
			},
			1,
			"a",
			nameById
		);
		expect(rules).toEqual([
			{
				conditions: [],
				priority: 1,
				rollout: { attribute: "userId", percentage: 30 },
				serve_variation: "treatment",
			},
		]);
	});

	test("encodes an n-way split with cumulative thresholds", ({ expect }) => {
		const rules = defaultServeToRules(
			{
				mode: "percentage",
				splits: [
					{ variationId: "b", weight: "25" },
					{ variationId: "c", weight: "25" },
					{ variationId: "a", weight: "50" },
				],
				targetingKey: "",
			},
			3,
			"a",
			nameById
		);
		expect(rules).toEqual([
			{
				conditions: [],
				priority: 3,
				rollout: { percentage: 25 },
				serve_variation: "treatment",
			},
			{
				conditions: [],
				priority: 4,
				rollout: { percentage: 50 },
				serve_variation: "holdback",
			},
		]);
	});

	test("round-trips a split through infer and encode", ({ expect }) => {
		const saved: FlagshipRule[] = [
			{
				conditions: [],
				priority: 1,
				rollout: { attribute: "userId", percentage: 25 },
				serve_variation: "treatment",
			},
			{
				conditions: [],
				priority: 2,
				rollout: { attribute: "userId", percentage: 60 },
				serve_variation: "holdback",
			},
		];
		const { defaultServe, targetingRules } = inferDefaultServe(
			saved,
			"a",
			variations,
			idByName
		);
		expect(targetingRules).toEqual([]);
		expect(defaultServe).toEqual({
			mode: "percentage",
			splits: [
				{ variationId: "b", weight: "25" },
				{ variationId: "c", weight: "35" },
				{ variationId: "a", weight: "40" },
			],
			targetingKey: "userId",
		});
		expect(defaultServeToRules(defaultServe, 1, "a", nameById)).toEqual(saved);
	});

	test("requires finite weights totalling 100", ({ expect }) => {
		const serve = {
			mode: "percentage" as const,
			splits: [
				{ variationId: "a", weight: "60" },
				{ variationId: "b", weight: "30" },
			],
			targetingKey: "",
		};
		expect(validateDefaultServe(serve)).toContain("currently 90%");
		expect(validateDefaultServe({ ...serve, mode: "variation" })).toBeNull();
		expect(
			validateDefaultServe({
				...serve,
				splits: [
					{ variationId: "a", weight: "33.4" },
					{ variationId: "b", weight: "66.6" },
				],
			})
		).toBeNull();
	});

	test("round-trips decimal split weights", ({ expect }) => {
		const saved: FlagshipRule[] = [
			{
				conditions: [],
				priority: 1,
				rollout: { attribute: "userId", percentage: 33.5 },
				serve_variation: "treatment",
			},
		];
		const { defaultServe } = inferDefaultServe(
			saved,
			"a",
			variations,
			idByName
		);

		expect(defaultServe.splits).toEqual([
			{ variationId: "b", weight: "33.5" },
			{ variationId: "a", weight: "66.5" },
			{ variationId: "c", weight: "0" },
		]);
		expect(defaultServeToRules(defaultServe, 1, "a", nameById)).toEqual(saved);
	});

	test("credits the uncovered remainder to the default variant", ({
		expect,
	}) => {
		const { defaultServe } = inferDefaultServe(
			[
				{
					conditions: [],
					priority: 1,
					rollout: { percentage: 30 },
					serve_variation: "control",
				},
			],
			"a",
			variations,
			idByName
		);
		expect(defaultServe.splits).toEqual([
			{ variationId: "a", weight: "100" },
			{ variationId: "b", weight: "0" },
			{ variationId: "c", weight: "0" },
		]);
		expect(validateDefaultServe(defaultServe)).toBeNull();
	});

	test("keeps rules bucketed by different attributes editable", ({
		expect,
	}) => {
		const mixed: FlagshipRule[] = [
			{
				conditions: [],
				priority: 1,
				rollout: { attribute: "userId", percentage: 25 },
				serve_variation: "treatment",
			},
			{
				conditions: [],
				priority: 2,
				rollout: { attribute: "accountId", percentage: 100 },
				serve_variation: "holdback",
			},
		];
		const { defaultServe, targetingRules } = inferDefaultServe(
			mixed,
			"a",
			variations,
			idByName
		);
		expect(defaultServe.mode).toBe("variation");
		expect(targetingRules).toEqual(mixed);
	});

	test("sums repeated variants instead of dropping a rule", ({ expect }) => {
		const { defaultServe } = inferDefaultServe(
			[
				{
					conditions: [],
					priority: 1,
					rollout: { percentage: 25 },
					serve_variation: "treatment",
				},
				{
					conditions: [],
					priority: 2,
					rollout: { percentage: 50 },
					serve_variation: "treatment",
				},
				{
					conditions: [],
					priority: 3,
					rollout: { percentage: 100 },
					serve_variation: "holdback",
				},
			],
			"a",
			variations,
			idByName
		);
		expect(defaultServe.splits).toEqual([
			{ variationId: "b", weight: "50" },
			{ variationId: "c", weight: "50" },
			{ variationId: "a", weight: "0" },
		]);
	});
});

describe("canonicalRules", () => {
	test("ignores rule order and priority gaps", ({ expect }) => {
		const saved: FlagshipRule[] = [
			{ conditions: [], priority: 9, serve_variation: "b" },
			{
				conditions: [],
				priority: 4,
				rollout: { percentage: 25 },
				serve_variation: "a",
			},
		];
		const resent: FlagshipRule[] = [
			{
				conditions: [],
				priority: 1,
				rollout: { percentage: 25 },
				serve_variation: "a",
			},
			{ conditions: [], priority: 2, serve_variation: "b" },
		];
		expect(canonicalRules(resent)).toBe(canonicalRules(saved));
		expect(
			canonicalRules([{ conditions: [], priority: 1, serve_variation: "a" }])
		).not.toBe(
			canonicalRules([
				{
					conditions: [],
					priority: 1,
					rollout: { percentage: 100 },
					serve_variation: "a",
				},
			])
		);
	});
});

describe("parseContextValue", () => {
	test("parses typed values without coercing bare strings", ({ expect }) => {
		const cases: Array<[string, unknown, string]> = [
			["25", 25, "number"],
			["-1.5", -1.5, "number"],
			["true", true, "boolean"],
			["null", null, "null"],
			['["a","b"]', ["a", "b"], "json"],
			['"25"', "25", "string"],
			["enterprise", "enterprise", "string"],
			["2024-06-01T00:00:00Z", "2024-06-01T00:00:00Z", "string"],
			["{ not json", "{ not json", "string"],
			["", "", "string"],
		];
		for (const [raw, value, type] of cases) {
			expect(parseContextValue(raw)).toEqual({ type, value });
		}
	});
});

describe("sanitizeVariationName", () => {
	test("replaces whitespace and drops unsupported characters", ({ expect }) => {
		expect(sanitizeVariationName("new checkout!")).toBe("new-checkout");
		expect(sanitizeVariationName("a_b-C9")).toBe("a_b-C9");
	});
});
