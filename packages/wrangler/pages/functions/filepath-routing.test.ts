import { toUrlPath } from "../../src/paths";
import { compareRoutes } from "./filepath-routing";

describe("compareRoutes()", () => {
  const url = toUrlPath;
  test("routes / last", () => {
    expect(compareRoutes([url("/")], [url("/foo")])).toBeGreaterThanOrEqual(1);
    expect(compareRoutes([url("/")], [url("/:foo")])).toBeGreaterThanOrEqual(1);
    expect(compareRoutes([url("/")], [url("/:foo*")])).toBeGreaterThanOrEqual(
      1
    );
  });

  test("routes with fewer segments come after those with more segments", () => {
    expect(
      compareRoutes([url("/foo")], [url("/foo/bar")])
    ).toBeGreaterThanOrEqual(1);
    expect(
      compareRoutes([url("/foo")], [url("/foo/bar/cat")])
    ).toBeGreaterThanOrEqual(1);
  });

  test("routes with wildcard segments come after those without", () => {
    expect(compareRoutes([url("/:foo*")], [url("/foo")])).toBe(1);
    expect(compareRoutes([url("/:foo*")], [url("/:foo")])).toBe(1);
  });

  test("routes with dynamic segments come after those without", () => {
    expect(compareRoutes([url("/:foo")], [url("/foo")])).toBe(1);
  });

  test("routes with dynamic segments occurring earlier come after those with dynamic segments in later positions", () => {
    expect(compareRoutes([url("/foo/:id/bar")], [url("/foo/bar/:id")])).toBe(1);
  });

  test("routes with no HTTP method come after those specifying a method", () => {
    expect(compareRoutes([url("/foo")], [url("/foo"), "GET"])).toBe(1);
  });

  test("two equal routes are sorted according to their original position in the list", () => {
    expect(compareRoutes([url("/foo"), "GET"], [url("/foo"), "GET"])).toBe(0);
  });

  test("it returns -1 if the first argument should appear first in the list", () => {
    expect(compareRoutes([url("/foo"), "GET"], [url("/foo")])).toBe(-1);
  });
});
