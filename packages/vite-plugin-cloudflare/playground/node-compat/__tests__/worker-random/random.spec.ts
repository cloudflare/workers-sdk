import { test, vi } from "vitest";
import { getJsonResponse, WAIT_FOR_OPTIONS } from "../../../__test-utils__";

test("should be able to call `getRandomValues()` bound to any object", async ({
	expect,
}) => {
	await vi.waitFor(
		async () =>
			expect(await getJsonResponse()).toEqual([
				expect.any(String),
				expect.any(String),
				expect.any(String),
				expect.any(String),
			]),
		WAIT_FOR_OPTIONS
	);
});
