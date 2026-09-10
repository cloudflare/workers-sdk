import { test } from "vitest";
import { getJsonResponse } from "../../__test-utils__";

const expectedVars = {
	MY_DEV_VAR_A: "my .env variable A",
	MY_DEV_VAR_B: "my .env variable B",
	MY_DEV_VAR_C: "my .env variable C",
};

// TODO: Reinstate when .env and .dev.vars files are supported with
// cloudflare.config.ts.
test.skip("reading variables from a standard .env file", async ({ expect }) => {
	expect(await getJsonResponse()).toEqual({
		"variables loaded from .env": expectedVars,
	});
});
