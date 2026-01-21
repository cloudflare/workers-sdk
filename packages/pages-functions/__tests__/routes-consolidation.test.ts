import { describe, expect, it } from "vitest";
import {
	consolidateRoutes,
	MAX_FUNCTIONS_ROUTES_RULE_LENGTH,
	shortenRoute,
} from "../src/routes-consolidation.js";

const maxRuleLength = MAX_FUNCTIONS_ROUTES_RULE_LENGTH;

describe("routes-consolidation", () => {
	describe("consolidateRoutes()", () => {
		it("should consolidate redundant routes", () => {
			expect(consolidateRoutes(["/api/foo", "/api/*"])).toEqual(["/api/*"]);
			expect(
				consolidateRoutes([
					"/api/foo",
					"/api/foo/*",
					"/api/bar/*",
					"/api/*",
					"/foo",
					"/foo/bar",
					"/bar/*",
					"/bar/baz/*",
					"/bar/baz/hello",
				])
			).toEqual(["/api/*", "/foo", "/foo/bar", "/bar/*"]);
		});

		it("should consolidate thousands of redundant routes", () => {
			// Test to make sure the consolidator isn't horribly slow
			const routes: string[] = [];
			const limit = 1000;
			for (let i = 0; i < limit; i++) {
				// Add 3 routes per id
				const id = `some-id-${i}`;
				routes.push(`/${id}/*`, `/${id}/foo`, `/${id}/bar/*`);
			}
			const consolidated = consolidateRoutes(routes);
			expect(consolidated.length).toEqual(limit);
			// Should be all unique
			expect(Array.from(new Set(consolidated)).length).toEqual(limit);
			// Should all have pattern `/$id/*`
			expect(
				consolidated.every((route) => route.match(/\/[a-z0-9-]+\/\*/) !== null)
			).toEqual(true);
		});

		it("should consolidate many redundant sub-routes", () => {
			const routes: string[] = [];
			const limit = 15;

			// Create $limit of top-level catch-all routes, with a lot of sub-routes
			for (let i = 0; i < limit; i++) {
				routes.push(`/foo-${i}/*`);
				for (let j = 0; j < limit; j++) {
					routes.push(`/foo-${i}/bar-${j}/hello`);
					for (let k = 0; k < limit; k++) {
						routes.push(`/foo-${i}/bar-${j}/baz-${k}/*`);
						routes.push(`/foo-${i}/bar-${j}/baz-${k}/profile`);
					}
				}
			}

			const consolidated = consolidateRoutes(routes);
			expect(consolidated.length).toEqual(limit);
			// Should be all unique
			expect(Array.from(new Set(consolidated)).length).toEqual(limit);
			// Should all have pattern `/$id/*`
			expect(
				consolidated.every((route) => route.match(/\/[a-z0-9-]+\/\*/) !== null)
			).toEqual(true);
		});

		it("should truncate long single-level path into catch-all path, removing other paths", () => {
			expect(
				consolidateRoutes([
					"/" + "a".repeat(maxRuleLength * 2),
					"/foo",
					"/bar/*",
					"/baz/bagel/coffee",
				])
			).toEqual(["/*"]);
		});

		it("should truncate long nested path, removing other paths", () => {
			expect(
				consolidateRoutes(["/foo/" + "a".repeat(maxRuleLength * 2), "/foo/bar"])
			).toEqual(["/foo/*"]);
		});

		it("keeps non-redundant routes", () => {
			const routes = ["/api/foo", "/other/bar"];
			expect(consolidateRoutes(routes)).toEqual(["/api/foo", "/other/bar"]);
		});

		it("deduplicates routes", () => {
			const routes = ["/api/foo", "/api/foo", "/api/foo"];
			expect(consolidateRoutes(routes)).toEqual(["/api/foo"]);
		});

		it("keeps wildcard routes that don't overlap", () => {
			const routes = ["/api/*", "/other/*"];
			expect(consolidateRoutes(routes)).toEqual(["/api/*", "/other/*"]);
		});
	});

	describe("shortenRoute()", () => {
		it("should allow max length path", () => {
			const route = "/" + "a".repeat(maxRuleLength - 1);
			expect(route.length).toEqual(maxRuleLength);
			expect(shortenRoute(route)).toEqual(route);
		});

		it("should allow max length path (with slash)", () => {
			const route = "/" + "a".repeat(maxRuleLength - 2) + "/";
			expect(route.length).toEqual(maxRuleLength);
			expect(shortenRoute(route)).toEqual(route);
		});

		it("should allow max length wildcard path", () => {
			const route = "/" + "a".repeat(maxRuleLength - 3) + "/*";
			expect(route.length).toEqual(maxRuleLength);
			expect(shortenRoute(route)).toEqual(route);
		});

		it("should truncate long specific path to shorter wildcard path", () => {
			const short = shortenRoute(
				"/" +
					"a".repeat(maxRuleLength * 0.6) +
					"/" +
					"b".repeat(maxRuleLength * 0.6)
			);
			expect(short).toEqual("/" + "a".repeat(maxRuleLength * 0.6) + "/*");
			expect(short.length).toBeLessThanOrEqual(maxRuleLength);
		});

		it("should truncate long specific path (with slash) to shorter wildcard path", () => {
			const short = shortenRoute(
				"/" +
					"a".repeat(maxRuleLength * 0.6) +
					"/" +
					"b".repeat(maxRuleLength * 0.6) +
					"/"
			);
			expect(short).toEqual("/" + "a".repeat(maxRuleLength * 0.6) + "/*");
			expect(short.length).toBeLessThanOrEqual(maxRuleLength);
		});

		it("should truncate long wildcard path to shorter wildcard path", () => {
			const short = shortenRoute(
				"/" +
					"a".repeat(maxRuleLength * 0.6) +
					"/" +
					"b".repeat(maxRuleLength * 0.6) +
					"/*"
			);
			expect(short).toEqual("/" + "a".repeat(maxRuleLength * 0.6) + "/*");
			expect(short.length).toBeLessThanOrEqual(maxRuleLength);
		});

		it("should truncate long single-level specific path to catch-all path", () => {
			expect(shortenRoute("/" + "a".repeat(maxRuleLength * 2))).toEqual("/*");
		});

		it("should truncate long single-level specific path (with slash) to catch-all path", () => {
			expect(shortenRoute("/" + "a".repeat(maxRuleLength * 2) + "/")).toEqual(
				"/*"
			);
		});

		it("should truncate long single-level wildcard path to catch-all path", () => {
			expect(shortenRoute("/" + "a".repeat(maxRuleLength * 2) + "/*")).toEqual(
				"/*"
			);
		});

		it("should truncate many single-character segments", () => {
			const short = shortenRoute("/a".repeat(maxRuleLength));
			expect(short).toEqual("/a".repeat(maxRuleLength / 2 - 1) + "/*");
			expect(short.length).toEqual(maxRuleLength);
		});

		it("should truncate many double-character segments", () => {
			const short = shortenRoute("/aa".repeat(maxRuleLength));
			expect(short).toEqual("/aa".repeat(maxRuleLength / 3 - 1) + "/*");
			expect(short.length).toEqual(maxRuleLength - 2);
		});

		it("should truncate many single-character segments with wildcard", () => {
			const short = shortenRoute("/a".repeat(maxRuleLength) + "/*");
			expect(short).toEqual("/a".repeat(maxRuleLength / 2 - 1) + "/*");
			expect(short.length).toEqual(maxRuleLength);
		});

		it("should truncate many double-character segments with wildcard", () => {
			const short = shortenRoute("/aa".repeat(maxRuleLength) + "/*");
			expect(short).toEqual("/aa".repeat(maxRuleLength / 3 - 1) + "/*");
			expect(short.length).toEqual(maxRuleLength - 2);
		});

		// Test variable-length segments to ensure it's always able to shorten rules
		for (const suffix of ["", "/", "/*"]) {
			it(`should truncate many variable-character segments (suffix="${suffix}") without truncating to /*`, () => {
				for (let i = 1; i < maxRuleLength - 2; i++) {
					const segment = "/" + "a".repeat(i);
					expect(segment.length).toBeLessThanOrEqual(maxRuleLength);
					const route =
						segment.repeat((maxRuleLength / segment.length) * 2) + suffix;
					expect(route.length).toBeGreaterThan(maxRuleLength);
					const short = shortenRoute(route);

					expect(short.length).toBeLessThanOrEqual(maxRuleLength);
					expect(short).not.toEqual("/*");
				}
			});
		}
	});
});
