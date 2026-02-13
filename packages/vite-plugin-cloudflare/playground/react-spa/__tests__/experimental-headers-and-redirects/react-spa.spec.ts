import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, vi } from "vitest";
import {
	failsIf,
	isBuild,
	page,
	viteTestUrl,
	WAIT_FOR_OPTIONS,
} from "../../../__test-utils__";

describe(
	"react-spa (with experimental support)",
	{ sequential: true, concurrent: false },
	() => {
		test("returns the correct home page", async ({ expect }) => {
			const content = await page.textContent("h1");
			expect(content).toBe("Vite + React");
		});

		test("allows updating state", async ({ expect }) => {
			const button = page.getByRole("button", { name: "increment" });
			const contentBefore = await button.innerText();
			expect(contentBefore).toBe("count is 0");
			await button.click();
			const contentAfter = await button.innerText();
			expect(contentAfter).toBe("count is 1");
		});

		test("returns the home page for not found routes", async ({ expect }) => {
			await page.goto(`${viteTestUrl}/random-page`);
			const content = await page.textContent("h1");
			expect(content).toBe("Vite + React");
		});

		// All these tests will fail without experimental support turned on
		describe("_headers", () => {
			test("applies _headers to HTML responses", async ({ expect }) => {
				const response = await fetch(viteTestUrl);
				expect(response.headers.get("X-Header")).toBe("Custom-Value!!!");
			});

			// Since Vite will return static assets immediately without invoking the Worker at all
			// such requests will not have _headers applied.
			failsIf(!isBuild)(
				"applies _headers to static assets",
				async ({ expect }) => {
					const response = await fetch(`${viteTestUrl}/vite.svg`);
					expect(response.headers.get("X-Header")).toBe("Custom-Value!!!");
				}
			);
		});

		// All these tests will fail without experimental support turned on
		describe("_redirects", () => {
			test("applies _redirects to HTML responses", async ({ expect }) => {
				const response = await fetch(`${viteTestUrl}/foo`, {
					redirect: "manual",
				});
				expect(response.status).toBe(302);
				expect(response.headers.get("Location")).toBe("/bar");
			});

			// Since Vite will return static assets immediately without invoking the Worker at all
			// such requests will not have _redirects applied.
			failsIf(!isBuild)(
				"applies _redirects to static assets",
				async ({ expect }) => {
					const response = await fetch(`${viteTestUrl}/redirect.svg`, {
						redirect: "manual",
					});
					expect(response.status).toBe(302);
					expect(response.headers.get("Location")).toBe("/target.svg");
				}
			);

			// Since Vite will return static assets immediately without invoking the Worker at all
			// such requests will not have _redirects applied.
			failsIf(!isBuild)(
				"supports proxying static assets to rewritten contents with _redirects",
				async ({ expect }) => {
					const response = await fetch(`${viteTestUrl}/rewrite.svg`);
					expect(response.status).toBe(200);
					expect(await response.text()).toContain("target.svg");
				}
			);
		});
	}
);

describe("reloading the server", () => {
	test.skipIf(isBuild)(
		"reloads config when the _headers or _redirects files change",
		async ({ expect, onTestFinished }) => {
			const headersPath = join(__dirname, "../../public/_headers");
			const originalHeaders = readFileSync(headersPath, "utf8");
			const redirectsPath = join(__dirname, "../../public/_redirects");
			const originalRedirects = readFileSync(redirectsPath, "utf8");
			onTestFinished(async () => {
				writeFileSync(headersPath, originalHeaders);
				writeFileSync(redirectsPath, originalRedirects);
			});

			const headersBefore = await fetch(viteTestUrl);
			expect(headersBefore.headers.get("X-Header")).toBe("Custom-Value!!!");
			const redirectBefore = await fetch(`${viteTestUrl}/foo`, {
				redirect: "manual",
			});
			expect(redirectBefore.status).toBe(302);

			// We make both these changes at the same time because there is something strange about the test setup
			// where fetches result in 500 errors, due to Miniflare stubs being reused after disposal.
			writeFileSync(headersPath, "");
			writeFileSync(redirectsPath, "");

			// Wait for Vite to reload
			await vi.waitFor(async () => {
				const headersAfter = await fetch(viteTestUrl);
				expect(headersAfter.headers.get("X-Header")).not.toBe(
					"Custom-Value!!!"
				);
				const redirectAfter = await fetch(`${viteTestUrl}/foo`, {
					redirect: "manual",
				});
				expect(redirectAfter.status).not.toBe(302);
			}, WAIT_FOR_OPTIONS);
		}
	);
});
