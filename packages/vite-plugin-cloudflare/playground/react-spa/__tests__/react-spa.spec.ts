import { describe, expect, test } from "vitest";
import { failsIf, isBuild, page, viteTestUrl } from "../../__test-utils__";

export const browserMode = true;

describe("react-spa", () => {
	test("returns the correct home page", async () => {
		const content = await page.textContent("h1");
		expect(content).toBe("Vite + React");
	});

	test("allows updating state", async () => {
		const button = page.getByRole("button", { name: "increment" });
		const contentBefore = await button.innerText();
		expect(contentBefore).toBe("count is 0");
		await button.click();
		const contentAfter = await button.innerText();
		expect(contentAfter).toBe("count is 1");
	});

	test("returns the home page for not found routes", async () => {
		await page.goto(`${viteTestUrl}/random-page`);
		const content = await page.textContent("h1");
		expect(content).toBe("Vite + React");
	});

	// All these _headers tests will fail without experimental support turned on in dev mode
	// But they will pass in build/preview mode.
	describe("_headers", () => {
		failsIf(!isBuild)("applies _headers to HTML responses", async () => {
			const response = await fetch(viteTestUrl);
			expect(response.headers.get("X-Header")).toBe("Custom-Value!!!");
		});

		failsIf(!isBuild)("applies _headers to static assets", async () => {
			const response = await fetch(`${viteTestUrl}/vite.svg`);
			expect(response.headers.get("X-Header")).toBe("Custom-Value!!!");
		});
	});

	// All these _redirects tests will fail without experimental support turned on in dev mode
	// But they will pass in build/preview mode.
	describe("_redirects", () => {
		failsIf(!isBuild)("applies _redirects to HTML responses", async () => {
			const response = await fetch(`${viteTestUrl}/foo`, {
				redirect: "manual",
			});
			expect(response.status).toBe(302);
			expect(response.headers.get("Location")).toBe("/bar");
		});

		failsIf(!isBuild)("applies _redirects to static assets", async () => {
			const response = await fetch(`${viteTestUrl}/redirect.svg`, {
				redirect: "manual",
			});
			expect(response.status).toBe(302);
			expect(response.headers.get("Location")).toBe("/target.svg");
		});

		failsIf(!isBuild)(
			"supports proxying static assets to rewritten contents with _redirects",
			async () => {
				const response = await fetch(`${viteTestUrl}/rewrite.svg`);
				expect(response.status).toBe(200);
				expect(await response.text()).toContain("target.svg");
			}
		);
	});
});
