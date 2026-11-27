import { test, vi } from "vitest";
import { getJsonResponse, WAIT_FOR_OPTIONS } from "../../__test-utils__";

test("reads Worker secrets from .dev.vars", async ({ expect }) => {
	await vi.waitFor(
		async () =>
			expect(await getJsonResponse()).toEqual({
				"variables present in .dev.vars": {
					MY_DEV_VAR_A: "my .dev.vars variable A",
					MY_DEV_VAR_B: "my .dev.vars variable B",
					MY_DEV_VAR_C: "my .dev.vars variable C",
				},
			}),
		WAIT_FOR_OPTIONS
	);
});
