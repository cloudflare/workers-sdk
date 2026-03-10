import { test } from "vitest";
import { getJsonResponse, isBuild } from "../../__test-utils__";

test.runIf(isBuild)(
	"supports imports with both static and dynamic paths in preview",
	async ({ expect }) => {
		const result = await getJsonResponse();
		expect(result).toEqual({
			staticPathImportResult: "Cloudflare",
			dynamicPathImportResult: "Cloudflare",
		});
	}
);
