import { expect, test } from "vitest";
import { getJsonResponse, isBuild } from "../../__test-utils__";

test("supports imports with both static and dynamic paths", async () => {
	const result = await getJsonResponse();
	expect(result).toEqual({
		staticPathImportResult: "Cloudflare",
		dynamicPathImportResult: "Cloudflare",
	});
});
