import { describe, expect, test } from "vitest";
import { getResponse, isBuild } from "../../../__test-utils__";

describe.runIf(!isBuild)(
	"adds headers included in `server.headers` to asset responses",
	() => {
		test("adds headers to HTML responses", async () => {
			const response = await getResponse();
			const customHeader = await response.headerValue("custom-header");
			expect(customHeader).toBe("custom-value");
		});

		test("adds headers to non-HTML responses", async () => {
			const response = await getResponse("/vite.svg");
			const customHeader = await response.headerValue("custom-header");
			expect(customHeader).toBe("custom-value");
		});
	}
);
