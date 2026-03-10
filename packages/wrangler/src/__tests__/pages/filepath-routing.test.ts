import { mkdirSync, writeFileSync } from "node:fs";
import { describe, it, test } from "vitest";
import {
	compareRoutes,
	generateConfigFromFileTree,
} from "../../pages/functions/filepath-routing";
import { toUrlPath } from "../../paths";
import { runInTempDir } from "../helpers/run-in-tmp";
import type { HTTPMethod, RouteConfig } from "../../pages/functions/routes";
import type { UrlPath } from "../../paths";

describe("filepath-routing", () => {
	describe("compareRoutes()", () => {
		test("routes / last", ({ expect }) => {
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

		test("routes with fewer segments come after those with more segments", ({
			expect,
		}) => {
			expect(
				compareRoutes(routeConfig("/foo"), routeConfig("/foo/bar"))
			).toBeGreaterThanOrEqual(1);
			expect(
				compareRoutes(routeConfig("/foo"), routeConfig("/foo/bar/cat"))
			).toBeGreaterThanOrEqual(1);
		});

		test("routes with wildcard segments come after those without", ({
			expect,
		}) => {
			expect(compareRoutes(routeConfig("/:foo*"), routeConfig("/foo"))).toBe(1);
			expect(compareRoutes(routeConfig("/:foo*"), routeConfig("/:foo"))).toBe(
				1
			);
		});

		test("routes with dynamic segments come after those without", ({
			expect,
		}) => {
			expect(compareRoutes(routeConfig("/:foo"), routeConfig("/foo"))).toBe(1);
		});

		test("routes with dynamic segments occurring earlier come after those with dynamic segments in later positions", ({
			expect,
		}) => {
			expect(
				compareRoutes(routeConfig("/foo/:id/bar"), routeConfig("/foo/bar/:id"))
			).toBe(1);
		});

		test("routes with no HTTP method come after those specifying a method", ({
			expect,
		}) => {
			expect(
				compareRoutes(routeConfig("/foo"), routeConfig("/foo", "GET"))
			).toBe(1);
		});

		test("two equal routes are sorted according to their original position in the list", ({
			expect,
		}) => {
			expect(
				compareRoutes(routeConfig("/foo", "GET"), routeConfig("/foo", "GET"))
			).toBe(0);
		});

		test("it returns -1 if the first argument should appear first in the list", ({
			expect,
		}) => {
			expect(
				compareRoutes(routeConfig("/foo", "GET"), routeConfig("/foo"))
			).toBe(-1);
		});
	});

	describe("generateConfigFromFileTree", () => {
		runInTempDir();

		it("should generate a route entry for each file in the tree", async ({
			expect,
		}) => {
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

			mkdirSync("todos");

			writeFileSync(
				"todos/[id].ts",
				`
      export function onRequestPost() {}
      export function onRequestDelete() {}
      `
			);

			mkdirSync("authors");
			mkdirSync("authors/[authorId]");
			mkdirSync("authors/[authorId]/todos");

			writeFileSync(
				"authors/[authorId]/todos/[todoId].ts",
				`
      export function onRequestPost() {}
      `
			);

			mkdirSync("books");

			writeFileSync(
				"books/[[title]].ts",
				`
      export function onRequestPost() {}
      `
			);

			mkdirSync("cats");
			mkdirSync("cats/[[breed]]");

			writeFileSync(
				"cats/[[breed]]/blah.ts",
				`
      export function onRequestPost() {}
      `
			);

			// This won't actually work at runtime.
			writeFileSync(
				"cats/[[breed]]/[[name]].ts",
				`
      export function onRequestPost() {}
      `
			);

			const entries = await generateConfigFromFileTree({
				baseDir: ".",
				baseURL: "/base" as UrlPath,
			});
			expect(entries).toMatchInlineSnapshot(`
				{
				  "routes": [
				    {
				      "method": "POST",
				      "module": [
				        "authors/[authorId]/todos/[todoId].ts:onRequestPost",
				      ],
				      "mountPath": "/base/authors/:authorId/todos",
				      "routePath": "/base/authors/:authorId/todos/:todoId",
				    },
				    {
				      "method": "POST",
				      "module": [
				        "cats/[[breed]]/blah.ts:onRequestPost",
				      ],
				      "mountPath": "/base/cats/:breed*",
				      "routePath": "/base/cats/:breed*/blah",
				    },
				    {
				      "method": "POST",
				      "module": [
				        "cats/[[breed]]/[[name]].ts:onRequestPost",
				      ],
				      "mountPath": "/base/cats/:breed*",
				      "routePath": "/base/cats/:breed*/:name*",
				    },
				    {
				      "method": "DELETE",
				      "module": [
				        "todos/[id].ts:onRequestDelete",
				      ],
				      "mountPath": "/base/todos",
				      "routePath": "/base/todos/:id",
				    },
				    {
				      "method": "POST",
				      "module": [
				        "todos/[id].ts:onRequestPost",
				      ],
				      "mountPath": "/base/todos",
				      "routePath": "/base/todos/:id",
				    },
				    {
				      "method": "POST",
				      "module": [
				        "books/[[title]].ts:onRequestPost",
				      ],
				      "mountPath": "/base/books",
				      "routePath": "/base/books/:title*",
				    },
				    {
				      "method": "DELETE",
				      "module": [
				        "bar.ts:onRequestDelete",
				      ],
				      "mountPath": "/base/",
				      "routePath": "/base/bar",
				    },
				    {
				      "method": "PUT",
				      "module": [
				        "bar.ts:onRequestPut",
				      ],
				      "mountPath": "/base/",
				      "routePath": "/base/bar",
				    },
				    {
				      "method": "GET",
				      "module": [
				        "foo.ts:onRequestGet",
				      ],
				      "mountPath": "/base/",
				      "routePath": "/base/foo",
				    },
				    {
				      "method": "POST",
				      "module": [
				        "foo.ts:onRequestPost",
				      ],
				      "mountPath": "/base/",
				      "routePath": "/base/foo",
				    },
				  ],
				}
			`);
		});

		it("should display an error if a simple route param name is invalid", async ({
			expect,
		}) => {
			mkdirSync("foo");
			writeFileSync(
				"foo/[hyphen-not-allowed].ts",
				"export function onRequestPost() {}"
			);
			await expect(
				generateConfigFromFileTree({
					baseDir: ".",
					baseURL: "/base" as UrlPath,
				})
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Invalid Pages function route parameter - "[hyphen-not-allowed]". Parameter names must only contain alphanumeric and underscore characters.]`
			);
		});

		it("should display an error if a catch-all route param name is invalid", async ({
			expect,
		}) => {
			mkdirSync("foo");
			writeFileSync(
				"foo/[[hyphen-not-allowed]].ts",
				"export function onRequestPost() {}"
			);
			await expect(
				generateConfigFromFileTree({
					baseDir: ".",
					baseURL: "/base" as UrlPath,
				})
			).rejects.toThrowErrorMatchingInlineSnapshot(
				`[Error: Invalid Pages function route parameter - "[[hyphen-not-allowed]]". Parameters names must only contain alphanumeric and underscore characters.]`
			);
		});
	});
});

function routeConfig(routePath: string, method?: string): RouteConfig {
	return {
		routePath: toUrlPath(routePath),
		mountPath: toUrlPath("/"),
		method: method as HTTPMethod,
	};
}
