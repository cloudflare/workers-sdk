import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Pages Functions Runtime", () => {
	describe("route matching", () => {
		it("matches the index route", async () => {
			const response = await SELF.fetch("https://example.com/");
			expect(response.status).toBe(200);
			expect(await response.text()).toBe("Hello from index");
		});

		it("matches static API routes", async () => {
			const response = await SELF.fetch("https://example.com/api/hello");
			expect(response.status).toBe(200);
			const json = await response.json();
			expect(json).toEqual({ message: "Hello from GET /api/hello" });
		});

		it("matches dynamic API routes with params", async () => {
			const response = await SELF.fetch("https://example.com/api/123");
			expect(response.status).toBe(200);
			const json = await response.json();
			expect(json).toEqual({ id: "123", method: "GET" });
		});

		it("matches routes by HTTP method", async () => {
			const response = await SELF.fetch("https://example.com/api/456", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ test: true }),
			});
			expect(response.status).toBe(200);
			const json = await response.json();
			expect(json).toEqual({ id: "456", method: "PUT", body: { test: true } });
		});

		it("handles POST with JSON body", async () => {
			const response = await SELF.fetch("https://example.com/api/hello", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "test" }),
			});
			expect(response.status).toBe(200);
			const json = await response.json();
			expect(json).toEqual({
				message: "Hello from POST",
				received: { name: "test" },
			});
		});
	});

	describe("middleware", () => {
		it("executes middleware and adds headers", async () => {
			const response = await SELF.fetch("https://example.com/");
			expect(response.headers.get("X-Middleware")).toBe("active");
		});

		it("executes middleware for API routes", async () => {
			const response = await SELF.fetch("https://example.com/api/hello");
			expect(response.headers.get("X-Middleware")).toBe("active");
		});
	});

	describe("404 handling", () => {
		it("returns 404 for unmatched routes", async () => {
			const response = await SELF.fetch("https://example.com/nonexistent");
			expect(response.status).toBe(404);
			expect(await response.text()).toBe("Not Found");
		});

		it("returns 404 for unmatched methods", async () => {
			const response = await SELF.fetch("https://example.com/api/hello", {
				method: "DELETE",
			});
			expect(response.status).toBe(404);
		});
	});
});
