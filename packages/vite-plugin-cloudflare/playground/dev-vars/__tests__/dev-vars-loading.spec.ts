import { test, vi } from "vitest";
import { getJsonResponse, WAIT_FOR_OPTIONS } from "../../__test-utils__";

// TODO: Reinstate when .env and .dev.vars files are supported with
// cloudflare.config.ts.
test.skip("reading variables from a standard .dev.vars file", async ({
	expect,
}) => {
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
