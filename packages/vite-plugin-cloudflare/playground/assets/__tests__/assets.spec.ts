import { expect, test } from "vitest";
import {
	getResponse,
	getTextResponse,
	isBuild,
	page,
	viteTestUrl,
} from "../../__test-utils__";

test("fetches public directory asset", async () => {
	const response = await getResponse("/public-directory-asset");
	const contentType = await response.headerValue("content-type");
	const additionalHeader = await response.headerValue("additional-header");
	expect(contentType).toBe("image/svg+xml");
	expect(additionalHeader).toBe("public-directory-asset");
});

// TODO: enable build test when assets are copied to client output directory
test.skipIf(isBuild)("fetches imported asset", async () => {
	const response = await getResponse("/imported-asset");
	const contentType = await response.headerValue("content-type");
	const additionalHeader = await response.headerValue("additional-header");
	expect(contentType).toBe("image/svg+xml");
	expect(additionalHeader).toBe("imported-asset");
});

// TODO: enable build test when assets are copied to client output directory
test.skipIf(isBuild)("fetches imported asset with url suffix", async () => {
	const text = await getTextResponse("/imported-asset-url-suffix");
	expect(text).toBe(`The text content is "Text content"`);
});

test("fetches transformed HTML asset", async () => {
	await page.goto(`${viteTestUrl}/transformed-html`);
	const content = await page.textContent("h1");
	expect(content).toBe("Modified content");
});
