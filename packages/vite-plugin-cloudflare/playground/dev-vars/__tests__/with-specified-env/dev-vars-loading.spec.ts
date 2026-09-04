import { test, vi } from "vitest";
import { getJsonResponse, WAIT_FOR_OPTIONS } from "../../../__test-utils__";

test("uses .dev.vars.staging exclusively", async ({ expect }) => {
	await vi.waitFor(
		async () =>
			expect(await getJsonResponse()).toEqual({
				"variables present in .dev.vars.staging": {
					MY_DEV_VAR_A: "my .dev.vars staging variable A",
					MY_DEV_VAR_B: "my .dev.vars staging variable B",
				},
			}),
		WAIT_FOR_OPTIONS
	);
});
