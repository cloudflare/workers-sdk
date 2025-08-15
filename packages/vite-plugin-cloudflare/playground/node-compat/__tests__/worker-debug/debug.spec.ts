import { expect, test, vi } from "vitest";
import { getJsonResponse } from "../../../__test-utils__";

test("debug is resolved correctly", async () => {
	await vi.waitFor(async () => {
		expect(await getJsonResponse()).toEqual([
			"test Test import message 1",
			"example:foo Example foo import message",
			"test Test import enabled message",
		]);
	});
});
