import { expect, test } from "vitest";
import { getResponse, page, viteTestUrl } from "../../__test-utils__";
import "./base-tests";

test("fetches transformed HTML asset", async () => {
	await page.goto(`${viteTestUrl}/transformed-html-asset`);
	const content = await page.textContent("h1");
	expect(content).toBe("Modified content");
});

test("fetches original public directory asset if requested directly", async () => {
	const response = await getResponse("/public-image.svg");
	const contentType = await response.headerValue("content-type");
	const additionalHeader = await response.headerValue("additional-header");
	expect(contentType).toBe("image/svg+xml");
	expect(additionalHeader).toBe(null);
});

test("fetches original HTML asset if requested directly", async () => {
	await page.goto(`${viteTestUrl}/html-page`);
	const content = await page.textContent("h1");
	expect(content).toBe("Original content");
});
