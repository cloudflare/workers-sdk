import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileFunctions, FunctionsNoRoutesError } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

describe("compileFunctions", () => {
	it("compiles a project to worker code", async () => {
		const projectDir = path.join(fixturesDir, "basic-project");
		const result = await compileFunctions(projectDir);

		// Should have generated code
		expect(result.code).toBeDefined();
		expect(result.code).toContain("import { match }");
		expect(result.code).toContain("createPagesHandler");
		expect(result.code).toContain("export default");

		// Should have routes
		expect(result.routes).toBeDefined();
		expect(result.routes.length).toBeGreaterThan(0);

		// Should have _routes.json spec
		expect(result.routesJson).toBeDefined();
		expect(result.routesJson.version).toBe(1);
		expect(result.routesJson.include).toBeDefined();
		expect(Array.isArray(result.routesJson.include)).toBe(true);
	});

	it("uses custom fallbackService", async () => {
		const projectDir = path.join(fixturesDir, "basic-project");
		const result = await compileFunctions(projectDir, {
			fallbackService: "CUSTOM_ASSETS",
		});

		expect(result.code).toContain('"CUSTOM_ASSETS"');
	});

	it("uses custom baseURL", async () => {
		const projectDir = path.join(fixturesDir, "basic-project");
		const result = await compileFunctions(projectDir, {
			baseURL: "/v1",
		});

		// Routes should be prefixed
		for (const route of result.routes) {
			expect(route.routePath.startsWith("/v1")).toBe(true);
		}
	});

	it("throws FunctionsNoRoutesError for empty project", async () => {
		const projectDir = path.join(fixturesDir, "empty-project");

		await expect(compileFunctions(projectDir)).rejects.toThrow(
			FunctionsNoRoutesError
		);
	});

	it("generates valid _routes.json", async () => {
		const projectDir = path.join(fixturesDir, "basic-project");
		const result = await compileFunctions(projectDir);

		// Validate structure
		expect(result.routesJson.version).toBe(1);
		expect(result.routesJson.include.length).toBeGreaterThan(0);
		expect(result.routesJson.exclude).toEqual([]);

		// Routes should be glob patterns
		for (const route of result.routesJson.include) {
			expect(route.startsWith("/")).toBe(true);
		}
	});
});
