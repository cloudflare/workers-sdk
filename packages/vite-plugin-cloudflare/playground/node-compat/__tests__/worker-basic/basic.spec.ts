import { expect, test, vi } from "vitest";
import { getTextResponse, WAIT_FOR_OPTIONS } from "../../../__test-utils__";

test("basic nodejs properties", async () => {
	await vi.waitFor(
		async () => expect(await getTextResponse()).toEqual(`"OK!"`),
		WAIT_FOR_OPTIONS
	);
});
