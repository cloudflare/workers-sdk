import { toUrlPath } from "../../paths";
import { convertRoutesToGlobPatterns } from "./routes-transformation";

// TODO: make a convenience function for creating a list
// of `convertRoutesToGlobPatterns` inputs from a string array
describe("route-paths-to-glob-patterns", () => {
	describe("convertRoutePathsToGlobPatterns()", () => {
		it("should pass through routes with no wildcards", () => {
			expect(
				convertRoutesToGlobPatterns([{ routePath: toUrlPath("/api/foo") }])
			).toEqual(["/api/foo"]);
			expect(
				convertRoutesToGlobPatterns([
					{ routePath: toUrlPath("/api/foo") },
					{ routePath: toUrlPath("/api/bar") },
				])
			).toEqual(["/api/foo", "/api/bar"]);
			expect(
				convertRoutesToGlobPatterns([
					{ routePath: toUrlPath("/api/foo") },
					{ routePath: toUrlPath("/api/bar/foo") },
					{ routePath: toUrlPath("/foo/bar") },
				])
			).toEqual(["/api/foo", "/api/bar/foo", "/foo/bar"]);
		});

		it("should escalate a single param route to a wildcard", () => {
			expect(
				convertRoutesToGlobPatterns([{ routePath: toUrlPath("/api/:foo") }])
			).toEqual(["/api/*"]);
			expect(
				convertRoutesToGlobPatterns([{ routePath: toUrlPath("/api/foo/:bar") }])
			).toEqual(["/api/foo/*"]);
			expect(
				convertRoutesToGlobPatterns([
					{ routePath: toUrlPath("/bar/:barId/foo") },
				])
			).toEqual(["/bar/*"]);
			expect(
				convertRoutesToGlobPatterns([
					{ routePath: toUrlPath("/bar/:barId/foo/:fooId") },
				])
			).toEqual(["/bar/*"]);
			expect(
				convertRoutesToGlobPatterns([
					{ routePath: toUrlPath("/api/:foo") },
					{ routePath: toUrlPath("/bar/:barName/profile") },
					{ routePath: toUrlPath("/foo/bar/:barId/:fooId") },
				])
			).toEqual(["/api/*", "/bar/*", "/foo/bar/*"]);
		});

		it("should pass through a single wildcard route", () => {
			expect(
				convertRoutesToGlobPatterns([{ routePath: toUrlPath("/api/:baz*") }])
			).toEqual(["/api/*"]);
			expect(
				convertRoutesToGlobPatterns([
					{ routePath: toUrlPath("/api/foo/bar/:baz*") },
				])
			).toEqual(["/api/foo/bar/*"]);
			expect(
				convertRoutesToGlobPatterns([
					{ routePath: toUrlPath("/api/:foo/:bar*") },
				])
			).toEqual(["/api/*"]);
			expect(
				convertRoutesToGlobPatterns([
					{ routePath: toUrlPath("/foo/:foo*/bar/:bar*") },
				])
			).toEqual(["/foo/*"]);
			expect(
				convertRoutesToGlobPatterns([
					{ routePath: toUrlPath("/foo/:foo/bar/:bar*") },
				])
			).toEqual(["/foo/*"]);
			expect(
				convertRoutesToGlobPatterns([
					{ routePath: toUrlPath("/api/:baz*") },
					{ routePath: toUrlPath("/api/foo/bar/:baz*") },
					{ routePath: toUrlPath("/api/:foo/:bar*") },
				])
			).toEqual(["/api/*", "/api/foo/bar/*"]);
		});

		it("should deduplicate identical rules", () => {
			expect(
				convertRoutesToGlobPatterns([
					{ routePath: toUrlPath("/api/foo") },
					{ routePath: toUrlPath("/api/foo") },
				])
			).toEqual(["/api/foo"]);
			expect(
				convertRoutesToGlobPatterns([
					{ routePath: toUrlPath("/api/foo/bar") },
					{ routePath: toUrlPath("/foo/bar") },
					{ routePath: toUrlPath("/api/foo/bar") },
				])
			).toEqual(["/api/foo/bar", "/foo/bar"]);
			expect(
				convertRoutesToGlobPatterns([
					{ routePath: toUrlPath("/api/foo/:bar") },
					{ routePath: toUrlPath("/api/foo") },
					{ routePath: toUrlPath("/api/foo/:fooId/bar") },
					{ routePath: toUrlPath("/api/foo/*") },
				])
			).toEqual(["/api/foo/*", "/api/foo"]);
			expect(
				convertRoutesToGlobPatterns([
					{ routePath: toUrlPath("/api/:baz*") },
					{ routePath: toUrlPath("/api/:foo") },
				])
			).toEqual(["/api/*"]);
		});

		it("should handle middleware mounting", () => {
			expect(
				convertRoutesToGlobPatterns([
					{
						routePath: toUrlPath("/middleware"),
						middleware: ["./some-middleware.ts"],
					},
				])
			).toEqual(["/middleware/*"]);

			expect(
				convertRoutesToGlobPatterns([
					{
						routePath: toUrlPath("/middleware"),
						middleware: "./some-middleware.ts",
					},
				])
			).toEqual(["/middleware/*"]);

			expect(
				convertRoutesToGlobPatterns([
					{
						routePath: toUrlPath("/middleware"),
						middleware: [],
					},
				])
			).toEqual(["/middleware"]);
		});
	});
});
