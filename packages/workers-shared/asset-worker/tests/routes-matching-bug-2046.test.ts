import { describe, expect, test } from "vitest";
import { generateStaticRoutingRuleMatcher } from "../src/utils/rules-engine";

describe("GitHub Issue #2046 - _routes.json exclude bug", () => {
	test("exclude rule '/' should only match root, not all paths", () => {
		const excludeMatcher = generateStaticRoutingRuleMatcher(["/"]);

		// Should match root
		expect(
			excludeMatcher({ request: new Request("https://example.com/") })
		).toBe(true);

		// Should NOT match other paths
		expect(
			excludeMatcher({ request: new Request("https://example.com/foo") })
		).toBe(false);

		expect(
			excludeMatcher({ request: new Request("https://example.com/index.html") })
		).toBe(false);

		expect(
			excludeMatcher({ request: new Request("https://example.com/api/test") })
		).toBe(false);
	});

	test("include rule '/*' should match all paths including root", () => {
		const includeMatcher = generateStaticRoutingRuleMatcher(["/*"]);

		// Should match root
		expect(
			includeMatcher({ request: new Request("https://example.com/") })
		).toBe(true);

		// Should match all other paths
		expect(
			includeMatcher({ request: new Request("https://example.com/foo") })
		).toBe(true);

		expect(
			includeMatcher({ request: new Request("https://example.com/index.html") })
		).toBe(true);

		expect(
			includeMatcher({ request: new Request("https://example.com/api/test") })
		).toBe(true);
	});

	test("combined scenario: exclude ['/'], include ['/*']", () => {
		// This simulates the user's reported scenario
		const excludeMatcher = generateStaticRoutingRuleMatcher(["/"]);
		const includeMatcher = generateStaticRoutingRuleMatcher(["/*"]);

		const testPath = (url: string) => {
			const request = new Request(url);

			// Check exclude first (goes to assets)
			if (excludeMatcher({ request })) {
				return "ASSETS";
			}

			// Then check include (goes to worker)
			if (includeMatcher({ request })) {
				return "WORKER";
			}

			return "ASSETS (default)";
		};

		// Root should be excluded (go to assets)
		expect(testPath("https://example.com/")).toBe("ASSETS");

		// All other paths should be included (go to worker)
		expect(testPath("https://example.com/foo")).toBe("WORKER");
		expect(testPath("https://example.com/index.html")).toBe("WORKER");
		expect(testPath("https://example.com/api/test")).toBe("WORKER");
		expect(testPath("https://example.com/foo/bar")).toBe("WORKER");
	});
});
