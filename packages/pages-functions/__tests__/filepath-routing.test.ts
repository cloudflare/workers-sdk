import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, test } from "vitest";
import {
	compareRoutes,
	generateConfigFromFileTree,
} from "../src/filepath-routing.js";
import type { RouteConfig, UrlPath } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function routeConfig(routePath: string, method?: string): RouteConfig {
	return {
		routePath: routePath as UrlPath,
		mountPath: "/" as UrlPath,
		method: method as RouteConfig["method"],
	};
}

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
		let tmpDir: string;

		beforeEach(() => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pages-functions-test-"));
		});

		afterEach(() => {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		it("should generate a route entry for each file in the tree", async () => {
			fs.writeFileSync(
				path.join(tmpDir, "foo.ts"),
				`
				export function onRequestGet() {}
				export function onRequestPost() {}
				`
			);
			fs.writeFileSync(
				path.join(tmpDir, "bar.ts"),
				`
				export function onRequestPut() {}
				export function onRequestDelete() {}
				`
			);

			fs.mkdirSync(path.join(tmpDir, "todos"));
			fs.writeFileSync(
				path.join(tmpDir, "todos/[id].ts"),
				`
				export function onRequestPost() {}
				export function onRequestDelete() {}
				`
			);

			fs.mkdirSync(path.join(tmpDir, "authors"));
			fs.mkdirSync(path.join(tmpDir, "authors/[authorId]"));
			fs.mkdirSync(path.join(tmpDir, "authors/[authorId]/todos"));
			fs.writeFileSync(
				path.join(tmpDir, "authors/[authorId]/todos/[todoId].ts"),
				`
				export function onRequestPost() {}
				`
			);

			fs.mkdirSync(path.join(tmpDir, "books"));
			fs.writeFileSync(
				path.join(tmpDir, "books/[[title]].ts"),
				`
				export function onRequestPost() {}
				`
			);

			fs.mkdirSync(path.join(tmpDir, "cats"));
			fs.mkdirSync(path.join(tmpDir, "cats/[[breed]]"));
			fs.writeFileSync(
				path.join(tmpDir, "cats/[[breed]]/blah.ts"),
				`
				export function onRequestPost() {}
				`
			);

			// This won't actually work at runtime but should parse
			fs.writeFileSync(
				path.join(tmpDir, "cats/[[breed]]/[[name]].ts"),
				`
				export function onRequestPost() {}
				`
			);

			const entries = await generateConfigFromFileTree({
				baseDir: tmpDir,
				baseURL: "/base" as UrlPath,
			});

			// Check we got the expected routes
			expect(entries.routes.length).toBe(10);

			// Check specific routes exist
			const authorsTodosRoute = entries.routes.find(
				(r) => r.routePath === "/base/authors/:authorId/todos/:todoId"
			);
			expect(authorsTodosRoute).toBeDefined();
			expect(authorsTodosRoute?.method).toBe("POST");

			const catsBlahRoute = entries.routes.find(
				(r) => r.routePath === "/base/cats/:breed*/blah"
			);
			expect(catsBlahRoute).toBeDefined();

			const catsNameRoute = entries.routes.find(
				(r) => r.routePath === "/base/cats/:breed*/:name*"
			);
			expect(catsNameRoute).toBeDefined();

			const todosRoute = entries.routes.find(
				(r) => r.routePath === "/base/todos/:id" && r.method === "POST"
			);
			expect(todosRoute).toBeDefined();

			const booksRoute = entries.routes.find(
				(r) => r.routePath === "/base/books/:title*"
			);
			expect(booksRoute).toBeDefined();

			// Routes should be sorted by specificity
			const routePaths = entries.routes.map((r) => r.routePath);
			const authorsTodosIndex = routePaths.indexOf(
				"/base/authors/:authorId/todos/:todoId"
			);
			const fooIndex = routePaths.indexOf("/base/foo");
			expect(authorsTodosIndex).toBeLessThan(fooIndex);
		});

		it("should display an error if a simple route param name is invalid", async () => {
			fs.mkdirSync(path.join(tmpDir, "foo"));
			fs.writeFileSync(
				path.join(tmpDir, "foo/[hyphen-not-allowed].ts"),
				"export function onRequestPost() {}"
			);

			await expect(
				generateConfigFromFileTree({
					baseDir: tmpDir,
					baseURL: "/base" as UrlPath,
				})
			).rejects.toThrow(
				'Invalid Pages function route parameter - "[hyphen-not-allowed]". Parameter names must only contain alphanumeric and underscore characters.'
			);
		});

		it("should display an error if a catch-all route param name is invalid", async () => {
			fs.mkdirSync(path.join(tmpDir, "foo"));
			fs.writeFileSync(
				path.join(tmpDir, "foo/[[hyphen-not-allowed]].ts"),
				"export function onRequestPost() {}"
			);

			await expect(
				generateConfigFromFileTree({
					baseDir: tmpDir,
					baseURL: "/base" as UrlPath,
				})
			).rejects.toThrow(
				'Invalid Pages function route parameter - "[[hyphen-not-allowed]]". Parameter names must only contain alphanumeric and underscore characters.'
			);
		});

		it("should handle middleware files", async () => {
			fs.writeFileSync(
				path.join(tmpDir, "_middleware.ts"),
				"export function onRequest() {}"
			);
			fs.writeFileSync(
				path.join(tmpDir, "index.ts"),
				"export function onRequest() {}"
			);

			const entries = await generateConfigFromFileTree({
				baseDir: tmpDir,
				baseURL: "/" as UrlPath,
			});

			const middlewareRoute = entries.routes.find((r) => r.middleware);
			expect(middlewareRoute).toBeDefined();
			expect(middlewareRoute?.middleware).toContain("_middleware.ts:onRequest");

			const indexRoute = entries.routes.find((r) => r.module);
			expect(indexRoute).toBeDefined();
		});

		it("should handle index files", async () => {
			fs.mkdirSync(path.join(tmpDir, "api"));
			fs.writeFileSync(
				path.join(tmpDir, "api/index.ts"),
				"export function onRequest() {}"
			);

			const entries = await generateConfigFromFileTree({
				baseDir: tmpDir,
				baseURL: "/" as UrlPath,
			});

			const apiRoute = entries.routes.find((r) => r.routePath === "/api");
			expect(apiRoute).toBeDefined();
		});

		it("should support various file extensions", async () => {
			fs.writeFileSync(
				path.join(tmpDir, "a.js"),
				"export function onRequest() {}"
			);
			fs.writeFileSync(
				path.join(tmpDir, "b.mjs"),
				"export function onRequest() {}"
			);
			fs.writeFileSync(
				path.join(tmpDir, "c.ts"),
				"export function onRequest() {}"
			);
			fs.writeFileSync(
				path.join(tmpDir, "d.tsx"),
				"export function onRequest() {}"
			);
			fs.writeFileSync(
				path.join(tmpDir, "e.jsx"),
				"export function onRequest() {}"
			);

			const entries = await generateConfigFromFileTree({
				baseDir: tmpDir,
				baseURL: "/" as UrlPath,
			});

			expect(entries.routes.length).toBe(5);
		});
	});

	describe("generateConfigFromFileTree (fixture)", () => {
		const functionsDir = path.join(
			__dirname,
			"fixtures/basic-project/functions"
		);

		it("generates routes from a functions directory", async () => {
			const config = await generateConfigFromFileTree({
				baseDir: functionsDir,
			});

			expect(config.routes).toBeDefined();
			expect(config.routes.length).toBeGreaterThan(0);

			// Should have root middleware
			const middlewareRoute = config.routes.find((r) =>
				r.middleware?.includes("_middleware.ts:onRequest")
			);
			expect(middlewareRoute).toBeDefined();

			// Should have index route
			const indexRoute = config.routes.find(
				(r) => r.routePath === "/" && r.module?.includes("index.ts:onRequest")
			);
			expect(indexRoute).toBeDefined();

			// Should have parameterized API routes
			const getRoute = config.routes.find(
				(r) => r.routePath === "/api/:id" && r.method === "GET"
			);
			expect(getRoute).toBeDefined();

			const postRoute = config.routes.find(
				(r) => r.routePath === "/api/:id" && r.method === "POST"
			);
			expect(postRoute).toBeDefined();
		});

		it("converts bracket params to path-to-regexp format", async () => {
			const config = await generateConfigFromFileTree({
				baseDir: functionsDir,
			});

			// [id] should become :id
			const apiRoute = config.routes.find((r) => r.routePath.includes("/api/"));
			expect(apiRoute?.routePath).toContain(":id");
			expect(apiRoute?.routePath).not.toContain("[id]");
		});

		it("respects baseURL option", async () => {
			const config = await generateConfigFromFileTree({
				baseDir: functionsDir,
				baseURL: "/prefix" as UrlPath,
			});

			// All routes should start with /prefix
			for (const route of config.routes) {
				expect(route.routePath.startsWith("/prefix")).toBe(true);
			}
		});

		it("sorts routes by specificity", async () => {
			const config = await generateConfigFromFileTree({
				baseDir: functionsDir,
			});

			// More specific routes should come before less specific ones
			const routePaths = config.routes.map((r) => r.routePath);

			// /api/:id should come before /
			const apiIndex = routePaths.findIndex((p) => p.includes("/api/"));
			const rootIndex = routePaths.findIndex((p) => p === "/");

			expect(apiIndex).toBeLessThan(rootIndex);
		});
	});
});
