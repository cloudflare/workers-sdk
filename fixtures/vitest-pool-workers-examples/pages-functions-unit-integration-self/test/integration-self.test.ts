import { SELF } from "cloudflare:test";
import { describe, it } from "vitest";

describe("functions", () => {
	it("calls function", async ({ expect }) => {
		// `SELF` here points to the worker running in the current isolate.
		// This gets its handler from the `main` option in `vitest.config.mts`.
		const response = await SELF.fetch("http://example.com/api/ping");
		// All `/api/*` requests go through `functions/api/_middleware.ts`,
		// which makes all response bodies uppercase
		expect(await response.text()).toBe("GET PONG");
	});

	it("calls function with params", async ({ expect }) => {
		let response = await SELF.fetch("https://example.com/api/kv/key", {
			method: "PUT",
			body: "value",
		});
		expect(response.status).toBe(204);

		response = await SELF.fetch("https://example.com/api/kv/key");
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("VALUE");
	});

	it("uses isolated storage for each test", async ({ expect }) => {
		// Check write in previous test undone
		const response = await SELF.fetch("https://example.com/api/kv/key");
		expect(response.status).toBe(204);
	});
});

describe("assets", () => {
	it("serves static assets", async ({ expect }) => {
		const response = await SELF.fetch("http://example.com/");
		expect(await response.text()).toMatchInlineSnapshot(`
		"<p>Homepage 🏡</p>
		"
	`);
	});

	it("respects 404.html", async ({ expect }) => {
		// `404.html` should be served for all unmatched requests
		const response = await SELF.fetch("http://example.com/not-found");
		expect(await response.text()).toMatchInlineSnapshot(`
  "<p>Not found 😭</p>
  "
`);
	});

	it("respects _redirects", async ({ expect }) => {
		const response = await SELF.fetch("http://example.com/take-me-home", {
			redirect: "manual",
		});
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/");
	});

	it("respects _headers", async ({ expect }) => {
		let response = await SELF.fetch("http://example.com/secure");
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");

		// Check headers only added to matching requests
		response = await SELF.fetch("http://example.com/");
		expect(response.headers.get("X-Frame-Options")).toBe(null);
	});
});
