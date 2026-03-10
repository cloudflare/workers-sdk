import { test, vi } from "vitest";
import { getTextResponse, WAIT_FOR_OPTIONS } from "../../../__test-utils__";

test("should get a populated process.env object", async ({ expect }) => {
	await vi.waitFor(
		async () => expect(await getTextResponse()).toBe(`OK!`),
		WAIT_FOR_OPTIONS
	);
});
