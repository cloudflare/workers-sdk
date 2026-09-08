import { describe, it } from "vitest";
import { MAX_ROUTES_RULES } from "../configuration/constants";
import { parseStaticRouting } from "../configuration/parseStaticRouting";

describe("parseStaticRouting", () => {
	it("throws when given empty rules", ({ expect }) => {
		expect(() => parseStaticRouting([])).toThrowErrorMatchingInlineSnapshot(
			`[Error: No \`run_worker_first\` rules were provided; must provide at least 1 rule.]`
		);
	});

	it("throws when given only negative rules", ({ expect }) => {
		expect(() =>
			parseStaticRouting(["!/assets"])
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Only negative \`run_worker_first\` rules were provided; must provide at least 1 non-negative rule]`
		);
	});

	it("throws when too many rules are provided", ({ expect }) => {
		const rules = Array.from({ length: 120 }, (_, i) => `/rule/${i}`);
		expect(() => parseStaticRouting(rules)).toThrowErrorMatchingInlineSnapshot(
			`[Error: Too many \`run_worker_first\` rules were provided; 120 rules provided exceeds max of 100.]`
		);

		const userWorkerRules = Array.from({ length: 60 }, (_, i) => `/rule/${i}`);
		const assetRules = Array.from({ length: 60 }, (_, i) => `!/rule/${60 + i}`);
		expect(() =>
			parseStaticRouting([...userWorkerRules, ...assetRules])
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Too many \`run_worker_first\` rules were provided; 120 rules provided exceeds max of 100.]`
		);

		const rulesWithRemovableDuplicates = [
			...Array.from({ length: 99 }, (_, i) => `/rule/${i}`),
			...Array.from({ length: 5 }, () => "/rule/0"),
		];
		expect(() => parseStaticRouting(rulesWithRemovableDuplicates))
			.toThrowErrorMatchingInlineSnapshot(`
			[Error: Too many \`run_worker_first\` rules were provided; 104 rules provided (99 distinct, 5 duplicate entries) exceeds max of 100. Duplicate entries count toward the limit.

			Duplicated rules:
			- "/rule/0"]
		`);

		const rulesWithRemainingExcess = [
			...Array.from({ length: 100 }, (_, i) => `/rule/${i}`),
			"/api/*",
			"!/assets/*",
			"!/assets/*",
			"/api/*",
		];
		expect(() => parseStaticRouting(rulesWithRemainingExcess))
			.toThrowErrorMatchingInlineSnapshot(`
			[Error: Too many \`run_worker_first\` rules were provided; 104 rules provided (102 distinct, 2 duplicate entries) exceeds max of 100. Duplicate entries count toward the limit.

			Duplicated rules:
			- "/api/*"
			- "!/assets/*"]
		`);

		const duplicatedRules = Array.from(
			{ length: MAX_ROUTES_RULES + 1 },
			(_, i) => `/duplicated/${i}`
		);
		const reportedDuplicatedRules = duplicatedRules
			.slice(0, 5)
			.map((rule) => `- ${JSON.stringify(rule)}`)
			.join("\n");
		expect(() =>
			parseStaticRouting([...duplicatedRules, ...duplicatedRules])
		).toThrow(
			new Error(
				`Too many \`run_worker_first\` rules were provided; 202 rules provided (101 distinct, 101 duplicate entries) exceeds max of 100. Duplicate entries count toward the limit.\n\nDuplicated rules:\n${reportedDuplicatedRules}\n...and 96 more duplicated rules.`
			)
		);
	});

	it("throws when a rule is too long", ({ expect }) => {
		const rule = `/api/${"a".repeat(130)}`;
		expect(() => parseStaticRouting([rule])).toThrowErrorMatchingInlineSnapshot(
			`
			[Error: Invalid routes in \`run_worker_first\`:
			'/api/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': all rules must be less than 100 characters in length]
		`
		);
	});

	it("throws when rule doesn't begin with /", ({ expect }) => {
		expect(() => parseStaticRouting(["api/*", "!asset"]))
			.toThrowErrorMatchingInlineSnapshot(`
				[Error: Invalid routes in \`run_worker_first\`:
				'api/*': rules must start with '/' or '!/'
				'!asset': negative rules must start with '!/']
			`);
	});

	it("throws when given redundant rules", ({ expect }) => {
		expect(() =>
			parseStaticRouting([
				"/api/*",
				"/oauth/callback",
				"/api/some/route",
				"!/api/assets/*",
			])
		).toThrowErrorMatchingInlineSnapshot(
			`
			[Error: Invalid routes in \`run_worker_first\`:
			'/api/some/route': rule '/api/*' makes it redundant]
		`
		);
	});

	it("throws when given duplicate routes", ({ expect }) => {
		expect(() =>
			parseStaticRouting([
				"/api/some/route",
				"/oauth/callback",
				"/api/some/route",
				"!/api/assets/*",
			])
		).toThrowErrorMatchingInlineSnapshot(
			`
			[Error: Invalid routes in \`run_worker_first\`:
			'/api/some/route': rule is a duplicate; rules must be unique]
		`
		);
	});

	it("correctly parses valid rules", ({ expect }) => {
		const parsed = parseStaticRouting([
			"/api/*",
			"/oauth/callback",
			"!/api/assets/*",
		]);
		const expected = {
			user_worker: ["/api/*", "/oauth/callback"],
			asset_worker: ["/api/assets/*"],
		};
		expect(parsed).toEqual(expected);
	});
});
