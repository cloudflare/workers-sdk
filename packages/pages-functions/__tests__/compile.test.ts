import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileFunctions, FunctionsNoRoutesError } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("compileFunctions", () => {
	it("compiles a functions directory to worker code", async () => {
		const functionsDir = path.join(__dirname, "fixtures/basic-functions");
		const result = await compileFunctions(functionsDir);

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
		const functionsDir = path.join(__dirname, "fixtures/basic-functions");
		const result = await compileFunctions(functionsDir, {
			fallbackService: "CUSTOM_ASSETS",
		});

		expect(result.code).toContain('"CUSTOM_ASSETS"');
	});

	it("uses custom baseURL", async () => {
		const functionsDir = path.join(__dirname, "fixtures/basic-functions");
		const result = await compileFunctions(functionsDir, {
			baseURL: "/v1",
		});

		// Routes should be prefixed
		for (const route of result.routes) {
			expect(route.routePath.startsWith("/v1")).toBe(true);
		}
	});

	it("throws FunctionsNoRoutesError for empty directory", async () => {
		const emptyDir = path.join(__dirname, "fixtures/empty-functions");

		await expect(compileFunctions(emptyDir)).rejects.toThrow(
			FunctionsNoRoutesError
		);
	});

	it("generates valid _routes.json", async () => {
		const functionsDir = path.join(__dirname, "fixtures/basic-functions");
		const result = await compileFunctions(functionsDir);

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
