import { expect, test, vi } from "vitest";
import { getTextResponse, WAIT_FOR_OPTIONS } from "../../../__test-utils__";

test("should support process global", async () => {
	await vi.waitFor(async () => {
		expect(await getTextResponse()).toBe(`OK!`);
	}, WAIT_FOR_OPTIONS);
});
