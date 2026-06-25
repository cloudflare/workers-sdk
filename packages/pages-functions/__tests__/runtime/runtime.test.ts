import { SELF } from "cloudflare:test";
import { describe, it } from "vitest";

// These tests exercise the runtime (see worker.ts) against handlers imported
// directly from the `basic-project` fixture. Response bodies and headers here
// must match what those fixture files actually return; if either drifts, the
// test will fail and that is intentional.

describe("Pages Functions Runtime", () => {
	describe("route matching", () => {
		it("matches the index route", async ({ expect }) => {
			const response = await SELF.fetch("https://example.com/");
			expect(response.status).toBe(200);
			expect(await response.text()).toBe("Hello from index");
		});

		it("matches static API routes", async ({ expect }) => {
			const response = await SELF.fetch("https://example.com/api/hello");
			expect(response.status).toBe(200);
			const json = await response.json();
			expect(json).toEqual({ message: "Hello from GET /api/hello" });
		});

		it("matches dynamic API routes with params", async ({ expect }) => {
			const response = await SELF.fetch("https://example.com/api/123");
			expect(response.status).toBe(200);
			const json = await response.json();
			expect(json).toEqual({ id: "123", method: "GET" });
		});

		it("matches routes by HTTP method", async ({ expect }) => {
			const response = await SELF.fetch("https://example.com/api/456", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ test: true }),
			});
			expect(response.status).toBe(200);
			const json = await response.json();
			expect(json).toEqual({ id: "456", method: "PUT", body: { test: true } });
		});

		it("handles POST with JSON body", async ({ expect }) => {
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
		it("executes middleware and adds headers on the index route", async ({
			expect,
		}) => {
			const response = await SELF.fetch("https://example.com/");
			expect(response.headers.get("X-Middleware")).toBe("active");
			expect(await response.text()).toBe("Hello from index");
		});

		it("executes middleware for API routes without altering the body", async ({
			expect,
		}) => {
			const response = await SELF.fetch("https://example.com/api/hello");
			expect(response.headers.get("X-Middleware")).toBe("active");
			const json = await response.json();
			expect(json).toEqual({ message: "Hello from GET /api/hello" });
		});
	});

	describe("404 handling", () => {
		it("returns 404 for unmatched routes", async ({ expect }) => {
			const response = await SELF.fetch("https://example.com/nonexistent");
			expect(response.status).toBe(404);
			expect(await response.text()).toBe("Not Found");
		});

		it("returns 404 for unmatched methods", async ({ expect }) => {
			const response = await SELF.fetch("https://example.com/api/hello", {
				method: "DELETE",
			});
			expect(response.status).toBe(404);
		});
	});
});
