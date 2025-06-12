import { describe, expect, it } from "vitest";
import { parseStaticRouting } from "../configuration/parseStaticRouting";

describe("parseStaticRouting", () => {
	it("throws when given empty rules", () => {
		expect(() => parseStaticRouting([])).toThrowErrorMatchingInlineSnapshot(
			`[Error: No \`run_worker_first\` rules were provided; must provide at least 1 rule.]`
		);
	});

	it("throws when given only negative rules", () => {
		expect(() =>
			parseStaticRouting(["!/assets"])
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Only negative \`run_worker_first\` rules were provided; must provide at least 1 non-negative rule]`
		);
	});

	it("throws when too many rules are provided", () => {
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
	});

	it("throws when a rule is too long", () => {
		const rule = `/api/${"a".repeat(130)}`;
		expect(() => parseStaticRouting([rule])).toThrowErrorMatchingInlineSnapshot(
			`
			[Error: Invalid routes in \`run_worker_first\`:
			'/api/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': all rules must be less than 100 characters in length]
		`
		);
	});

	it("throws when rule doesn't begin with /", () => {
		expect(() => parseStaticRouting(["api/*", "!asset"]))
			.toThrowErrorMatchingInlineSnapshot(`
				[Error: Invalid routes in \`run_worker_first\`:
				'api/*': rules must start with '/' or '!/'
				'!asset': negative rules must start with '!/']
			`);
	});

	it("throws when given redundant rules", () => {
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

	it("throws when given duplicate routes", () => {
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

	it("correctly parses valid rules", () => {
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
