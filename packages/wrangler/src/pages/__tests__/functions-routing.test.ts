import {
  convertRouteListToFilterRules,
  WorkerRouter,
} from "../routes-to-filter-rules";
import { compareRoutes } from "../functions/filepath-routing";
import { toUrlPath } from "../../paths";
import { RouteConfig } from "../functions/routes";

function convert(input: string[], maxRules: number): WorkerRouter {
  const sortedList: RouteConfig[] = input
    .map((r) => ({ routePath: toUrlPath(r), mountPath: toUrlPath("/") }))
    .sort(compareRoutes);
  try {
    expect(sortedList.map((rc) => rc.routePath)).toEqual(input);
  } catch (e) {
    throw new Error(
      "You must sort the input to execute the same way compareRoutes would, otherwise you'll get weird errors"
    );
  }
  return convertRouteListToFilterRules(input, maxRules);
}

describe("functions routing", () => {
  describe("single input", () => {
    it("should handle an empty input", () => {
      expect(convert([], 1)).toEqual({
        include: [],
        exclude: [],
      });
    });
    it("should pass through a single route, no wildcards", () => {
      expect(convert(["/api/foo"], 1)).toEqual({
        include: ["/api/foo"],
        exclude: [],
      });
    });
    it("should escalate a single param route to a wildcard", () => {
      expect(convert(["/api/:foo"], 1)).toEqual({
        include: ["/api/*"],
        exclude: [],
      });
    });
    it("should pass through a single wildcard route", () => {
      expect(convert(["/api/:baz*"], 1)).toEqual({
        include: ["/api/*"],
        exclude: [],
      });
    });
  });

  describe("nested inputs", () => {
    it("should replace a rule that's already matched", () => {
      expect(convert(["/api/foo", "/api/:bar"], 2)).toEqual({
        include: ["/api/*"],
        exclude: [],
      });
    });
  });

  describe("failure cases", () => {
    it("should verify sorting", () => {
      expect(() => {
        convert(["/api/:bar", "/api/foo"], 2);
      }).toThrowError(
        new Error(
          "You must sort the input to execute the same way compareRoutes would, otherwise you'll get weird errors"
        )
      );
    });
  });
});
