import { expect, test } from "vitest";
import { parseStaticRouting } from "../configuration/parseStaticRouting";

test("should throw an error for invalid JSON input", () => {
	const input = `include: [/*]`;

	expect(() => parseStaticRouting(input)).toThrowErrorMatchingInlineSnapshot(
		`[SyntaxError: Unexpected token 'i', "include: [/*]" is not valid JSON]`
	);
});

test("should throw an error for unsupported schema versions", () => {
	const input = `{
		"version": 5,
		"include": ["/*"]
	}`;

	expect(() => parseStaticRouting(input)).toThrowErrorMatchingInlineSnapshot(
		`
		[ZodError: [
		  {
		    "received": 5,
		    "code": "invalid_literal",
		    "expected": 1,
		    "path": [
		      "version"
		    ],
		    "message": "Invalid literal value, expected 1"
		  }
		]]
	`
	);
});

test("should throw an error when no rules are provided", () => {
	const input = `{
		"version": 1,
		"include": [],
		"exclude": []
	}`;

	expect(() => parseStaticRouting(input)).toThrowErrorMatchingInlineSnapshot(
		`[Error: No rules were provided; must provide at least 1 include rule]`
	);
});

test("should throw an error when only exclude rules are provided", () => {
	const input = `{
		"version": 1,
		"include": [],
		"exclude": ["/assets"]
	}`;

	expect(() => parseStaticRouting(input)).toThrowErrorMatchingInlineSnapshot(
		`[Error: Only exclude rules were provided; must provide at least 1 include rule]`
	);
});

test("should throw an error when too many rules are provided", () => {
	const rules = Array.from({ length: 120 }, (_, i) => `"/rule/${i}"`).join(",");
	const input = `{
		"version": 1,
		"include": [${rules}],
		"exclude": []
	}`;

	expect(() => parseStaticRouting(input)).toThrowErrorMatchingInlineSnapshot(
		`[Error: Too many rules were provided; 120 rules provided exceeds max of 100]`
	);
});

test("should throw an error when too many rules are provided in combination", () => {
	const rules = Array.from({ length: 60 }, (_, i) => `"/rule/${i}"`).join(",");

	const input = `{
		"version": 1,
		"include": [${rules}],
		"exclude": [${rules}]
	}`;

	expect(() => parseStaticRouting(input)).toThrowErrorMatchingInlineSnapshot(
		`[Error: Too many rules were provided; 120 rules provided exceeds max of 100]`
	);
});

test("should throw an error when a rule exceeds the maximum character length", () => {
	const rule = `/api/${"a".repeat(130)}`;
	const input = `{
		"version": 1,
		"include": ["${rule}"],
		"exclude": []
	}`;

	expect(() => parseStaticRouting(input)).toThrowErrorMatchingInlineSnapshot(
		`
		[Error: Invalid routes in _routes.json found
		Invalid include rules:
		Rule '/api/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' is invalid; all rules must be less than 100 characters in length]
	`
	);
});

test("should throw an error when description exceeds the maximum character length", () => {
	const input = `{
		"version": 1,
		"include": ["/api/*"],
		"exclude": [],
		"description": "${"a".repeat(130)}"
	}`;

	expect(() => parseStaticRouting(input)).toThrowErrorMatchingInlineSnapshot(
		`[Error: Description is invalid; must be less than 100 characters]`
	);
});

test("should throw an error when rules do not start with a slash", () => {
	const input = `{
		"version": 1,
		"include": ["/api/*"],
		"exclude": ["asset"]
	}`;

	expect(() => parseStaticRouting(input)).toThrowErrorMatchingInlineSnapshot(
		`
		[Error: Invalid routes in _routes.json found
		Invalid exclude rules:
		Rule 'asset' is invalid; all rules must begin with '/']
	`
	);
});

test("should throw an error for redundant include rules", () => {
	const input = `{
		"version": 1,
		"include": ["/api/*", "/oauth/callback", "/api/some/route"],
		"exclude": ["/api/assets/*"]
	}`;

	expect(() => parseStaticRouting(input)).toThrowErrorMatchingInlineSnapshot(
		`
		[Error: Invalid routes in _routes.json found
		Invalid include rules:
		Rule '/api/some/route' is invalid; rule '/api/*' makes it redundant]
	`
	);
});

test("should report errors for include and exclude rules together", () => {
	const input = `{
		"version": 1,
		"include": ["/api/*", "oauth/callback", "/api/some/route"],
		"exclude": ["/bpi/*", "bpi", "/bpi/some/route"]
	}`;

	expect(() => parseStaticRouting(input)).toThrowErrorMatchingInlineSnapshot(
		`
		[Error: Invalid routes in _routes.json found
		Invalid include rules:
		Rule '/api/some/route' is invalid; rule '/api/*' makes it redundant
		Rule 'oauth/callback' is invalid; all rules must begin with '/'

		Invalid exclude rules:
		Rule '/bpi/some/route' is invalid; rule '/bpi/*' makes it redundant
		Rule 'bpi' is invalid; all rules must begin with '/']
	`
	);
});

test("should parse valid static routing configuration", () => {
	const input = `{
		"version": 1,
		"include": ["/api/*", "/oauth/callback"],
		"exclude": ["/api/assets/*"]
	}`;

	const staticRouting = parseStaticRouting(input);

	const expected = {
		version: 1,
		include: ["/api/*", "/oauth/callback"],
		exclude: ["/api/assets/*"],
	};

	expect(staticRouting).toEqual(expected);
});

test("should error when rules are not unique", () => {
	const input = `{
		"version": 1,
		"include": ["/api/*", "/api/*", "/bpi/*", "/bpi/*"],
		"exclude": []
	}`;

	expect(() => parseStaticRouting(input)).toThrowErrorMatchingInlineSnapshot(
		`
		[Error: Invalid routes in _routes.json found
		Invalid include rules:
		Rule '/api/*' is a duplicate; rules must be unique
		Rule '/bpi/*' is a duplicate; rules must be unique]
	`
	);
});

test("should parse routes", () => {
	const input = `{
		"version": 1,
		"include": ["/api/*", "/bpi*", "/oauth/callback"],
		"exclude": ["/api/assets/*", "/blah"],
		"description": "This is a test description"
		}`;
	const result = parseStaticRouting(input);
	expect(result).toMatchInlineSnapshot(`
		{
		  "description": "This is a test description",
		  "exclude": [
		    "/api/assets/*",
		    "/blah",
		  ],
		  "include": [
		    "/api/*",
		    "/bpi*",
		    "/oauth/callback",
		  ],
		  "version": 1,
		}
	`);
});
