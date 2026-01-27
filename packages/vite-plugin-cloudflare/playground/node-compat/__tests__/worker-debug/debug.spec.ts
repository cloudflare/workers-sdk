import { expect, test, vi } from "vitest";
import {
	getJsonResponse,
	isVite8,
	WAIT_FOR_OPTIONS,
} from "../../../__test-utils__";

// See https://github.com/rolldown/rolldown/issues/7973
// Will be fixed in rolldown@1.0.0-rc.2
test.skipIf(isVite8)("debug is resolved correctly", async () => {
	await vi.waitFor(async () => {
		expect(await getJsonResponse()).toEqual([
			"test Test import message 1",
			"example:foo Example foo import message",
			"test Test import enabled message",
		]);
	}, WAIT_FOR_OPTIONS);
});
