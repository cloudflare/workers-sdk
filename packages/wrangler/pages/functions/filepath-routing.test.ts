import { compareRoutes } from "./filepath-routing";

describe("compareRoutes()", () => {
  test("routes / last", () => {
    expect(compareRoutes("/", "/foo")).toBeGreaterThanOrEqual(1);
    expect(compareRoutes("/", "/:foo")).toBeGreaterThanOrEqual(1);
    expect(compareRoutes("/", "/:foo*")).toBeGreaterThanOrEqual(1);
  });

  test("routes with fewer segments come after those with more segments", () => {
    expect(compareRoutes("/foo", "/foo/bar")).toBeGreaterThanOrEqual(1);
    expect(compareRoutes("/foo", "/foo/bar/cat")).toBeGreaterThanOrEqual(1);
  });

  test("routes with wildcard segments come after those without", () => {
    expect(compareRoutes("/:foo*", "/foo")).toBe(1);
    expect(compareRoutes("/:foo*", "/:foo")).toBe(1);
  });

  test("routes with dynamic segments come after those without", () => {
    expect(compareRoutes("/:foo", "/foo")).toBe(1);
  });

  test("routes with dynamic segments occuring earlier come after those with dynamic segments in later positions", () => {
    expect(compareRoutes("/foo/:id/bar", "/foo/bar/:id")).toBe(1);
  });

  test("routes with no HTTP method come after those specifying a method", () => {
    expect(compareRoutes("/foo", "GET /foo")).toBe(1);
  });

  test("two equal routes are sorted according to their original position in the list", () => {
    expect(compareRoutes("GET /foo", "GET /foo")).toBe(0);
  });

  test("it returns -1 if the first argument should appear first in the list", () => {
    expect(compareRoutes("GET /foo", "/foo")).toBe(-1);
  });
});
