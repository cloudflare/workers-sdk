import { describe, test } from "vitest";
import { evaluateFlag } from "../../../src/workers/flagship/evaluate";
import type {
	EvalFlag,
	EvalRule,
	EvaluationContext,
} from "../../../src/workers/flagship/evaluate";

// Account tag used by the upstream Flagship data-plane test suite. The bucket
// expectations below are copied from there and pin the vendored MurmurHash3
// implementation.
const UPSTREAM_ACCOUNT_ID = "aaaabbbbccccdddd1111222233334444";

function flag(overrides: Partial<EvalFlag> = {}): EvalFlag {
	return {
		key: "test",
		enabled: true,
		default_variation: "off",
		variations: { on: true, off: false },
		rules: [],
		...overrides,
	};
}

function rolloutFlag(percentage: number, attribute?: string): EvalFlag {
	return flag({
		key: "rollout_test",
		rules: [
			{
				conditions: [],
				serve_variation: "on",
				rollout: { percentage, attribute },
			},
		],
	});
}

/**
 * Recover the exact rollout bucket for a targeting key. A rule is included
 * when `bucket < percentage`, so the smallest including percentage is
 * `bucket + 1`.
 */
function bucketFor(targetingKey: unknown): number {
	for (let percentage = 1; percentage <= 100; percentage++) {
		const { reason } = evaluateFlag(
			rolloutFlag(percentage),
			{ targetingKey } as EvaluationContext,
			UPSTREAM_ACCOUNT_ID
		);
		if (reason === "SPLIT") {
			return percentage - 1;
		}
	}
	return 100;
}

describe("flagship evaluation", () => {
	test("serves the default variation when no rule matches", ({ expect }) => {
		expect(evaluateFlag(flag(), {}, "local")).toEqual({
			value: false,
			variant: "off",
			reason: "DEFAULT",
		});
	});

	test("serves the default variation and skips rules when disabled", ({
		expect,
	}) => {
		const disabled = flag({
			enabled: false,
			rules: [{ conditions: [], serve_variation: "on" }],
		});
		expect(evaluateFlag(disabled, {}, "local")).toEqual({
			value: false,
			variant: "off",
			reason: "DISABLED",
		});
	});

	test("serves the first matching rule in array order", ({ expect }) => {
		const multi = flag({
			variations: { a: "a", b: "b", off: "off" },
			rules: [
				{
					conditions: [{ attribute: "userId", operator: "equals", value: "1" }],
					serve_variation: "a",
				},
				{ conditions: [], serve_variation: "b" },
			],
		});
		expect(evaluateFlag(multi, { userId: "1" }, "local")).toMatchObject({
			variant: "a",
			reason: "TARGETING_MATCH",
		});
		expect(evaluateFlag(multi, { userId: "2" }, "local")).toMatchObject({
			variant: "b",
			reason: "TARGETING_MATCH",
		});
	});

	test("throws when a served variation is not defined", ({ expect }) => {
		const broken = flag({ default_variation: "missing" });
		expect(() => evaluateFlag(broken, {}, "local")).toThrow(
			"Flag 'test' variation 'missing' is not defined"
		);
	});

	describe("conditions", () => {
		function matches(
			conditions: EvalRule["conditions"],
			context: EvaluationContext
		): boolean {
			const result = evaluateFlag(
				flag({ rules: [{ conditions, serve_variation: "on" }] }),
				context,
				"local"
			);
			return result.reason === "TARGETING_MATCH";
		}

		test("missing context attributes never match", ({ expect }) => {
			expect(
				matches([{ attribute: "plan", operator: "equals", value: "pro" }], {})
			).toBe(false);
		});

		test("comparisons coerce through String()", ({ expect }) => {
			expect(
				matches([{ attribute: "id", operator: "equals", value: 42 }], {
					id: "42",
				})
			).toBe(true);
		});

		test("in and not_in require arrays", ({ expect }) => {
			expect(
				matches([{ attribute: "country", operator: "in", value: ["US"] }], {
					country: "US",
				})
			).toBe(true);
			expect(
				matches([{ attribute: "country", operator: "in", value: "US" }], {
					country: "US",
				})
			).toBe(false);
			expect(
				matches([{ attribute: "country", operator: "not_in", value: [] }], {
					country: "US",
				})
			).toBe(true);
		});

		test("ISO-8601 targets compare as timestamps", ({ expect }) => {
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
		});

		test("empty AND clauses match, empty OR clauses do not", ({ expect }) => {
			expect(matches([{ logical_operator: "AND", clauses: [] }], {})).toBe(
				true
			);
			expect(matches([{ logical_operator: "OR", clauses: [] }], {})).toBe(
				false
			);
		});

		test("unknown operators do not match", ({ expect }) => {
			expect(
				matches(
					[
						{
							attribute: "id",
							operator: "spaceship" as never,
							value: "1",
						},
					],
					{ id: "1" }
				)
			).toBe(false);
		});
	});

	describe("rollouts", () => {
		// Buckets pinned against the upstream Flagship suite for flag
		// `rollout_test` under UPSTREAM_ACCOUNT_ID (hash seed 45).
		test("buckets match the upstream hash vectors", ({ expect }) => {
			const buckets = Object.fromEntries(
				["0", "1", "2", "", "日本語", "héllo", "false"].map((key) => [
					key,
					bucketFor(key),
				])
			);
			expect(buckets).toEqual({
				"0": 15,
				"1": 8,
				"2": 91,
				"": 50,
				日本語: 9,
				héllo: 73,
				false: 33,
			});
		});

		test("non-string targeting keys hash as their string form", ({
			expect,
		}) => {
			expect(bucketFor(0)).toBe(bucketFor("0"));
			expect(bucketFor(false)).toBe(bucketFor("false"));
		});

		test("100 percent always matches and reports SPLIT", ({ expect }) => {
			for (const targetingKey of ["0", "1", "50", "99", "999"]) {
				expect(
					evaluateFlag(rolloutFlag(100), { targetingKey }, UPSTREAM_ACCOUNT_ID)
				).toMatchObject({ reason: "SPLIT" });
			}
		});

		test("0 percent never matches", ({ expect }) => {
			for (const targetingKey of ["0", "1", "50", "99", "999"]) {
				expect(
					evaluateFlag(rolloutFlag(0), { targetingKey }, UPSTREAM_ACCOUNT_ID)
				).toMatchObject({ reason: "DEFAULT" });
			}
		});

		test("a missing targeting key buckets randomly", ({ expect }) => {
			const { reason } = evaluateFlag(rolloutFlag(50), {}, UPSTREAM_ACCOUNT_ID);
			expect(["SPLIT", "DEFAULT"]).toContain(reason);
		});

		test("the seed varies by account and by flag", ({ expect }) => {
			const keys = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
			const bucketsFor = (flagKey: string, accountId: string) =>
				keys.map((targetingKey) => {
					const rollout = rolloutFlag(50);
					rollout.key = flagKey;
					const { reason } = evaluateFlag(rollout, { targetingKey }, accountId);
					return reason;
				});

			const baseline = bucketsFor("rollout_test", UPSTREAM_ACCOUNT_ID);
			expect(bucketsFor("rollout_test", "local")).not.toEqual(baseline);
			expect(bucketsFor("other_flag", UPSTREAM_ACCOUNT_ID)).not.toEqual(
				baseline
			);
		});

		test("a custom rollout attribute replaces targetingKey", ({ expect }) => {
			const byUserId = rolloutFlag(50, "userId");
			expect(
				evaluateFlag(byUserId, { userId: "1" }, UPSTREAM_ACCOUNT_ID)
			).toMatchObject({ reason: "SPLIT" });
			expect(
				evaluateFlag(byUserId, { userId: "2" }, UPSTREAM_ACCOUNT_ID)
			).toMatchObject({ reason: "DEFAULT" });
		});
	});
});
