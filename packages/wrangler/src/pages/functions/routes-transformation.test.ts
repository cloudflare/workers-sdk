import { convertRoutePathsToGlobPatterns } from "./routes-transformation";

describe("route-paths-to-glob-patterns", () => {
  describe("convertRoutePathsToGlobPatterns()", () => {
    it("should pass through routes with no wildcards", () => {
      expect(convertRoutePathsToGlobPatterns(["/api/foo"])).toEqual(["/api/foo"]);
      expect(convertRoutePathsToGlobPatterns(["/api/foo", "/api/bar"])).toEqual(["/api/foo", "/api/bar"]);
      expect(convertRoutePathsToGlobPatterns(["/api/foo", "/api/bar/foo", "/foo/bar"])).toEqual(["/api/foo", "/api/bar/foo", "/foo/bar"]);
    });

    it("should escalate a single param route to a wildcard", () => {
      expect(convertRoutePathsToGlobPatterns(["/api/:foo"])).toEqual(["/api/*"]);
      expect(convertRoutePathsToGlobPatterns(["/api/foo/:bar"])).toEqual(["/api/foo/*"]);
      expect(convertRoutePathsToGlobPatterns(["/bar/:barId/foo"])).toEqual(["/bar/*"]);
      expect(convertRoutePathsToGlobPatterns(["/bar/:barId/foo/:fooId"])).toEqual(["/bar/*"]);
      expect(convertRoutePathsToGlobPatterns(["/api/:foo", "/bar/:barName/profile", "/foo/bar/:barId/:fooId"])).toEqual(["/api/*", "/bar/*", "/foo/bar/*"]);
    });

    it("should pass through a single wildcard route", () => {
      expect(convertRoutePathsToGlobPatterns(["/api/:baz*"])).toEqual(["/api/*"]);
      expect(convertRoutePathsToGlobPatterns(["/api/foo/bar/:baz*"])).toEqual(["/api/foo/bar/*"]);
      expect(convertRoutePathsToGlobPatterns(["/api/:foo/:bar*"])).toEqual(["/api/*"]);
      expect(convertRoutePathsToGlobPatterns(["/foo/:foo*/bar/:bar*"])).toEqual(["/foo/*"]);
      expect(convertRoutePathsToGlobPatterns(["/foo/:foo/bar/:bar*"])).toEqual(["/foo/*"]);
      expect(convertRoutePathsToGlobPatterns(["/api/:baz*", "/api/foo/bar/:baz*", "/api/:foo/:bar*"])).toEqual(["/api/*", "/api/foo/bar/*"]);
    });

    it("should deduplicate identical rules", () => {
      expect(convertRoutePathsToGlobPatterns(["/api/foo", "/api/foo"])).toEqual(["/api/foo"]);
      expect(convertRoutePathsToGlobPatterns(["/api/foo/bar", "/foo/bar", "/api/foo/bar"])).toEqual(["/api/foo/bar", "/foo/bar"]);
      expect(convertRoutePathsToGlobPatterns(["/api/foo/:bar", "/api/foo", "/api/foo/:fooId/bar", "/api/foo/*"])).toEqual(["/api/foo/*", "/api/foo"]);
      expect(convertRoutePathsToGlobPatterns(["/api/:baz*", "/api/:foo"])).toEqual(["/api/*"]);
    });
  });
});