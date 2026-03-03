import { test } from "vitest";
import { fetchJson, page, viteTestUrl } from "../../../__test-utils__";

test("returns the correct home page", async ({ expect }) => {
	const content = await page.textContent("h1");
	expect(content).toBe("Vite + TypeScript");
});

test("returns the correct response from the API", async ({ expect }) => {
	const result = await fetchJson("/api/");
	expect(result).toEqual({ name: "Cloudflare" });
});

test("returns the correct response from the experimental plugin", async ({ expect }) => {
	const response = await fetch(`${viteTestUrl}/__experimental-plugin-test`);
	expect(response.status).toBe(200);
	const result = await response.json();
	expect(result).toEqual({ hasMiniflare: true, type: "workers" });
});
