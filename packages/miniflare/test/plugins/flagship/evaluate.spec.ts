import { describe, test } from "vitest";
import { evaluateFlag } from "../../../src/workers/flagship/evaluate";
import type { EvaluationContext } from "../../../src/workers/flagship/evaluate";
import type { FlagInput, Rule } from "../../../src/workers/flagship/flags";

const ACCOUNT_TAG = "aaaabbbbccccdddd1111222233334444";

function flag(overrides: Partial<FlagInput> = {}): FlagInput {
	return {
		key: "test",
		enabled: true,
		default_variation: "off",
		variations: { on: true, off: false },
		rules: [],
		...overrides,
	};
}

function rolloutFlag(percentage: number, attribute?: string): FlagInput {
	return flag({
		key: "rollout_test",
		rules: [
			{
				priority: 1,
				conditions: [],
				serve_variation: "on",
				rollout: { percentage, attribute },
			},
		],
	});
}

function matches(
	conditions: Rule["conditions"],
	context: EvaluationContext
): boolean {
	return (
		evaluateFlag(
			flag({ rules: [{ priority: 1, conditions, serve_variation: "on" }] }),
			context,
			"local"
		).reason === "TARGETING_MATCH"
	);
}

function bucketFor(targetingKey: unknown): number {
	for (let percentage = 1; percentage <= 100; percentage++) {
		if (
			evaluateFlag(rolloutFlag(percentage), { targetingKey }, ACCOUNT_TAG)
				.reason === "SPLIT"
		) {
			return percentage - 1;
		}
	}
	return 100;
}

describe("flagship evaluation", () => {
	test("serves defaults, disabled flags, and the first matching rule", ({
		expect,
	}) => {
		expect(evaluateFlag(flag(), {}, "local")).toEqual({
			value: false,
			variant: "off",
			reason: "DEFAULT",
		});
		expect(
			evaluateFlag(
				flag({
					enabled: false,
					rules: [{ priority: 1, conditions: [], serve_variation: "on" }],
				}),
				{},
				"local"
			)
		).toMatchObject({ variant: "off", reason: "DISABLED" });

		const ordered = flag({
			variations: { first: "a", second: "b", off: "off" },
			rules: [
				{
					priority: 1,
					conditions: [{ attribute: "id", operator: "equals", value: 1 }],
					serve_variation: "first",
				},
				{ priority: 2, conditions: [], serve_variation: "second" },
			],
		});
		expect(evaluateFlag(ordered, { id: "1" }, "local").variant).toBe("first");
		expect(evaluateFlag(ordered, { id: "2" }, "local").variant).toBe("second");
		ordered.rules.reverse();
		expect(evaluateFlag(ordered, { id: "1" }, "local").variant).toBe("first");
	});

	test("rejects an undefined served variation", ({ expect }) => {
		expect(() =>
			evaluateFlag(flag({ default_variation: "missing" }), {}, "local")
		).toThrow("Flag 'test' variation 'missing' is not defined");
	});

	test("matches comparison and logical conditions with production coercions", ({
		expect,
	}) => {
		expect(
			matches([{ attribute: "id", operator: "equals", value: 42 }], {
				id: "42",
			})
		).toBe(true);
		expect(
			matches([{ attribute: "country", operator: "in", value: ["US"] }], {
				country: "US",
			})
		).toBe(true);
		expect(
			matches([{ attribute: "country", operator: "not_in", value: [] }], {
				country: "US",
			})
		).toBe(true);
		expect(
			matches(
				[
					{
						attribute: "now",
						operator: "greater_than",
						value: "2025-05-01T15:00:00Z",
					},
				],
				{ now: "2025-06-01T15:00:00Z" }
			)
		).toBe(true);
		expect(matches([{ logical_operator: "AND", clauses: [] }], {})).toBe(true);
		expect(matches([{ logical_operator: "OR", clauses: [] }], {})).toBe(false);
	});

	test("does not match missing attributes or malformed operators", ({
		expect,
	}) => {
		expect(
			matches([{ attribute: "plan", operator: "equals", value: "pro" }], {})
		).toBe(false);
		expect(
			matches([{ attribute: "country", operator: "in", value: "US" }], {
				country: "US",
			})
		).toBe(false);
		expect(
			matches([{ attribute: "id", operator: "invalid" as never, value: 1 }], {
				id: 1,
			})
		).toBe(false);
	});

	describe("rollouts", () => {
		test("matches upstream hash vectors and stringifies targeting keys", ({
			expect,
		}) => {
			expect(
				Object.fromEntries(
					["0", "1", "2", "", "日本語", "héllo", "false"].map((key) => [
						key,
						bucketFor(key),
					])
				)
			).toEqual({
				"0": 15,
				"1": 8,
				"2": 91,
				"": 50,
				日本語: 9,
				héllo: 73,
				false: 33,
			});
			expect(bucketFor(0)).toBe(bucketFor("0"));
			expect(bucketFor(false)).toBe(bucketFor("false"));
		});

		test("honors rollout boundaries and custom attributes", ({ expect }) => {
			expect(evaluateFlag(rolloutFlag(100), {}, ACCOUNT_TAG).reason).toBe(
				"SPLIT"
			);
			expect(
				evaluateFlag(rolloutFlag(0), { targetingKey: "1" }, ACCOUNT_TAG).reason
			).toBe("DEFAULT");
			const custom = rolloutFlag(50, "userId");
			expect(evaluateFlag(custom, { userId: "1" }, ACCOUNT_TAG).reason).toBe(
				"SPLIT"
			);
			expect(evaluateFlag(custom, { userId: "2" }, ACCOUNT_TAG).reason).toBe(
				"DEFAULT"
			);
			expect(["SPLIT", "DEFAULT"]).toContain(
				evaluateFlag(rolloutFlag(50), {}, ACCOUNT_TAG).reason
			);
		});

		test("seeds buckets by account and flag", ({ expect }) => {
			const reasons = (flagKey: string, accountTag: string) =>
				["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map(
					(targetingKey) => {
						const rollout = rolloutFlag(50);
						rollout.key = flagKey;
						return evaluateFlag(rollout, { targetingKey }, accountTag).reason;
					}
				);
			const baseline = reasons("rollout_test", ACCOUNT_TAG);
			expect(reasons("rollout_test", "local")).not.toEqual(baseline);
			expect(reasons("other", ACCOUNT_TAG)).not.toEqual(baseline);
		});
	});
});
