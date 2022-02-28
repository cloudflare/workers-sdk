import { writeFileSync } from "fs";
import { describe, it, test, expect } from "vitest";
import { runInTempDir } from "../../src/__tests__/helpers/run-in-tmp";
import { toUrlPath } from "../../src/paths";
import { compareRoutes, generateConfigFromFileTree } from "./filepath-routing";
import type { UrlPath } from "../../src/paths";
import type { HTTPMethod, RouteConfig } from "./routes";

describe("filepath-routing", () => {
  describe("compareRoutes()", () => {
    test("routes / last", () => {
      expect(
        compareRoutes(routeConfig("/"), routeConfig("/foo"))
      ).toBeGreaterThanOrEqual(1);
      expect(
        compareRoutes(routeConfig("/"), routeConfig("/:foo"))
      ).toBeGreaterThanOrEqual(1);
      expect(
        compareRoutes(routeConfig("/"), routeConfig("/:foo*"))
      ).toBeGreaterThanOrEqual(1);
    });

    test("routes with fewer segments come after those with more segments", () => {
      expect(
        compareRoutes(routeConfig("/foo"), routeConfig("/foo/bar"))
      ).toBeGreaterThanOrEqual(1);
      expect(
        compareRoutes(routeConfig("/foo"), routeConfig("/foo/bar/cat"))
      ).toBeGreaterThanOrEqual(1);
    });

    test("routes with wildcard segments come after those without", () => {
      expect(compareRoutes(routeConfig("/:foo*"), routeConfig("/foo"))).toBe(1);
      expect(compareRoutes(routeConfig("/:foo*"), routeConfig("/:foo"))).toBe(
        1
      );
    });

    test("routes with dynamic segments come after those without", () => {
      expect(compareRoutes(routeConfig("/:foo"), routeConfig("/foo"))).toBe(1);
    });

    test("routes with dynamic segments occurring earlier come after those with dynamic segments in later positions", () => {
      expect(
        compareRoutes(routeConfig("/foo/:id/bar"), routeConfig("/foo/bar/:id"))
      ).toBe(1);
    });

    test("routes with no HTTP method come after those specifying a method", () => {
      expect(
        compareRoutes(routeConfig("/foo"), routeConfig("/foo", "GET"))
      ).toBe(1);
    });

    test("two equal routes are sorted according to their original position in the list", () => {
      expect(
        compareRoutes(routeConfig("/foo", "GET"), routeConfig("/foo", "GET"))
      ).toBe(0);
    });

    test("it returns -1 if the first argument should appear first in the list", () => {
      expect(
        compareRoutes(routeConfig("/foo", "GET"), routeConfig("/foo"))
      ).toBe(-1);
    });
  });

  describe("generateConfigFromFileTree", () => {
    runInTempDir();

    it("should generate a route entry for each file in the tree", async () => {
      writeFileSync(
        "foo.ts",
        `
      export function onRequestGet() {}
      export function onRequestPost() {}
      `
      );
      writeFileSync(
        "bar.ts",
        `
      export function onRequestPut() {}
      export function onRequestDelete() {}
      `
      );

      const entries = await generateConfigFromFileTree({
        baseDir: ".",
        baseURL: "/base" as UrlPath,
      });
      expect(entries).toEqual({
        routes: [
          {
            method: "DELETE",
            module: ["bar.ts:onRequestDelete"],
            routePath: "/base/bar",
          },
          {
            method: "PUT",
            module: ["bar.ts:onRequestPut"],
            routePath: "/base/bar",
          },
          {
            method: "GET",
            module: ["foo.ts:onRequestGet"],
            routePath: "/base/foo",
          },
          {
            method: "POST",
            module: ["foo.ts:onRequestPost"],
            routePath: "/base/foo",
          },
        ],
      });
    });
  });
});

function routeConfig(routePath: string, method?: string): RouteConfig {
  return {
    routePath: toUrlPath(routePath),
    method: method as HTTPMethod,
  };
}
