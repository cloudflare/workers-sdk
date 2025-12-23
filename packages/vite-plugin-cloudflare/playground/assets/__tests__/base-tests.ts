import { expect, test } from "vitest";
import { getResponse, getTextResponse } from "../../__test-utils__";

test("fetches public directory asset", async () => {
	const response = await getResponse("/public-directory-asset");
	const contentType = await response.headerValue("content-type");
	const additionalHeader = await response.headerValue("additional-header");
	expect(contentType).toBe("image/svg+xml");
	expect(additionalHeader).toBe("public-directory-asset");
});

test("fetches imported asset", async () => {
	const response = await getResponse("/imported-asset");
	const contentType = await response.headerValue("content-type");
	const additionalHeader = await response.headerValue("additional-header");
	expect(contentType).toBe("image/svg+xml");
	expect(additionalHeader).toBe("imported-asset");
});

test("fetches imported asset with url suffix", async () => {
	const text = await getTextResponse("/imported-asset-url-suffix");
	expect(text).toBe(`The text content is "Text content"`);
});

test("fetches inline asset", async () => {
	const response = await getResponse("/inline-asset");
	const contentType = await response.headerValue("content-type");
	const additionalHeader = await response.headerValue("additional-header");
	expect(contentType).toBe("image/svg+xml");
	expect(additionalHeader).toBe("inline-asset");
});
