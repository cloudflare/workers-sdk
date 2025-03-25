import { expect, test } from "vitest";
import { getJsonResponse, page } from "../../../__test-utils__";

test("returns the correct home page", async () => {
	const content = await page.textContent("h1");
	expect(content).toBe("Vite + TypeScript");
});

test("returns the correct response from the API", async () => {
	const result = await getJsonResponse("/api/");
	expect(result).toEqual({ name: "Cloudflare" });
});
