import { convertRouteNamesToAsterisks } from "./routes-to-filter-rules";

describe("functions routing", () => {
	describe("single input", () => {
		it("should handle an empty input", () => {
			expect(convertRouteNamesToAsterisks([])).toEqual([]);
		});
		it("should pass through a single route, no wildcards", () => {
			expect(convertRouteNamesToAsterisks(["/api/foo"])).toEqual(["/api/foo"]);
		});
		it("should escalate a single param route to a wildcard", () => {
			expect(convertRouteNamesToAsterisks(["/api/:foo"])).toEqual(["/api/*"]);
		});
		it("should escalate multiple params to multiple wildcards", () => {
			expect(
				convertRouteNamesToAsterisks([
					"/api/users/:userId/favorites/:favoriteId",
				])
			).toEqual(["/api/users/*/favorites/*"]);
		});
		it("should handle multiple routes", () => {
			expect(convertRouteNamesToAsterisks(["/foo/", "/foo/:bar"])).toEqual([
				"/foo/",
				"/foo/*",
			]);
		});
		it("should pass through a single wildcard route", () => {
			expect(convertRouteNamesToAsterisks(["/api/:baz*"])).toEqual(["/api/*"]);
		});
	});
});
