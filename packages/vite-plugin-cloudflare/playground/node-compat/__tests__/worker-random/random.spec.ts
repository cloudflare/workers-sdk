import { expect, test } from "vitest";
import { getJsonResponse } from "../../../__test-utils__";

test("should be able to call `getRandomValues()` bound to any object", async () => {
	const result = await getJsonResponse();
	expect(result).toEqual([
		expect.any(String),
		expect.any(String),
		expect.any(String),
		expect.any(String),
	]);
});
