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
			`[Error: Only negative rules were provided; must provide at least 1 non-negative rule]`
		);
	});

	it("throws when too many rules are provided", () => {
		const rules = Array.from({ length: 120 }, (_, i) => `/rule/${i}`);
		expect(() => parseStaticRouting(rules)).toThrowErrorMatchingInlineSnapshot(
			`[Error: Too many rules were provided; 120 rules provided exceeds max of 100]`
		);

		const userWorkerRules = Array.from({ length: 60 }, (_, i) => `/rule/${i}`);
		const assetRules = Array.from({ length: 60 }, (_, i) => `!/rule/${60 + i}`);
		expect(() =>
			parseStaticRouting([...userWorkerRules, ...assetRules])
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Too many rules were provided; 120 rules provided exceeds max of 100]`
		);
	});

	it("throws when a rule is too long", () => {
		const rule = `/api/${"a".repeat(130)}`;
		const { errorMessage } = parseStaticRouting([rule]);
		expect(errorMessage).toMatchInlineSnapshot(
			`
			"Invalid routes in run_worker_first:
			'/api/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': all rules must be less than 100 characters in length"
		`
		);
	});

	it("errors when rule doesn't begin with /", () => {
		const { errorMessage } = parseStaticRouting(["api/*", "!asset"]);
		expect(errorMessage).toMatchInlineSnapshot(`
			"Invalid routes in run_worker_first:
			'api/*': rules must start with '/' or '!/'
			'!asset': negative rules must start with '!/'"
		`);
	});

	it("errors when given redundant rules", () => {
		const { errorMessage } = parseStaticRouting([
			"/api/*",
			"/oauth/callback",
			"/api/some/route",
			"!/api/assets/*",
		]);
		expect(errorMessage).toMatchInlineSnapshot(
			`
			"Invalid routes in run_worker_first:
			'/api/some/route': rule '/api/*' makes it redundant"
		`
		);
	});

	it("errors when given duplicate routes", () => {
		const { errorMessage } = parseStaticRouting([
			"/api/some/route",
			"/oauth/callback",
			"/api/some/route",
			"!/api/assets/*",
		]);
		expect(errorMessage).toMatchInlineSnapshot(
			`
			"Invalid routes in run_worker_first:
			'/api/some/route': rule is a duplicate; rules must be unique"
		`
		);
	});

	it("correctly parses valid rules", () => {
		const { parsed, errorMessage } = parseStaticRouting([
			"/api/*",
			"/oauth/callback",
			"!/api/assets/*",
		]);
		const expected = {
			user_worker: ["/api/*", "/oauth/callback"],
			asset_worker: ["/api/assets/*"],
		};
		expect(parsed).toEqual(expected);
		expect(errorMessage).toBeUndefined();
	});
});
