import { describe, expect, it } from "vitest";
import { generateWorkerEntrypoint } from "../src/codegen.js";
import type { RouteConfig } from "../src/types.js";

describe("codegen", () => {
	describe("generateWorkerEntrypoint", () => {
		it("generates imports and routes array", () => {
			const routes: RouteConfig[] = [
				{
					routePath: "/api/:id",
					mountPath: "/api",
					method: "GET",
					module: ["api/[id].ts:onRequestGet"],
				},
			];

			const code = generateWorkerEntrypoint(routes, {
				functionsDirectory: "/project/functions",
				fallbackService: "ASSETS",
			});

			// path-to-regexp is imported from its resolved absolute path
			expect(code).toMatch(/import \{ match \} from ".*path-to-regexp.*"/);
			expect(code).toContain("import { onRequestGet as");
			expect(code).toContain('routePath: "/api/:id"');
			expect(code).toContain('mountPath: "/api"');
			expect(code).toContain('method: "GET"');
			expect(code).toContain(
				"createPagesHandler(routes, __FALLBACK_SERVICE__)"
			);
		});

		it("handles middleware routes", () => {
			const routes: RouteConfig[] = [
				{
					routePath: "/",
					mountPath: "/",
					middleware: ["_middleware.ts:onRequest"],
					module: ["index.ts:onRequest"],
				},
			];

			const code = generateWorkerEntrypoint(routes, {
				functionsDirectory: "/project/functions",
			});

			expect(code).toContain("middlewares: [");
			expect(code).toContain("modules: [");
		});

		it("generates unique identifiers for duplicate export names", () => {
			const routes: RouteConfig[] = [
				{
					routePath: "/a",
					mountPath: "/a",
					module: ["a.ts:onRequest"],
				},
				{
					routePath: "/b",
					mountPath: "/b",
					module: ["b.ts:onRequest"],
				},
			];

			const code = generateWorkerEntrypoint(routes, {
				functionsDirectory: "/project/functions",
			});

			// Should have two different identifiers
			const matches = code.match(/import \{ onRequest as (\w+) \}/g);
			expect(matches).toHaveLength(2);
		});

		it("includes runtime code", () => {
			const routes: RouteConfig[] = [
				{
					routePath: "/",
					mountPath: "/",
					module: ["index.ts:onRequest"],
				},
			];

			const code = generateWorkerEntrypoint(routes, {
				functionsDirectory: "/project/functions",
			});

			// Runtime code should be inlined
			expect(code).toContain("function* executeRequest");
			expect(code).toContain("function createPagesHandler");
			expect(code).toContain("cloneResponse");
		});
	});
});
