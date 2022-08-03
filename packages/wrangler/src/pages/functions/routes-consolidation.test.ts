import { consolidateRoutes } from "./routes-consolidation";

describe("route-consolidation", () => {
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
	});
});
