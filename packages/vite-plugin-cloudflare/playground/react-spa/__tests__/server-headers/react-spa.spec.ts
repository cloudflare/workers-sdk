import { describe, expect, test } from "vitest";
import { getResponse, isBuild } from "../../../__test-utils__";

describe.runIf(!isBuild)(
	"adds headers included in Vite's `server.headers` to asset responses in dev",
	() => {
		test("adds headers to HTML responses", async () => {
			const response = await getResponse();
			const headers = Object.fromEntries(response.headers.entries());
			expect(headers).toMatchObject({
				"custom-string": "string-value",
				"custom-string-array": "one, two, three",
				"custom-number": "123",
			});
		});

		test("adds headers to non-HTML responses", async () => {
			const response = await getResponse("/vite.svg");
			const headers = Object.fromEntries(response.headers.entries());
			expect(headers).toMatchObject({
				"custom-string": "string-value",
				"custom-string-array": "one, two, three",
				"custom-number": "123",
			});
		});
	}
);
