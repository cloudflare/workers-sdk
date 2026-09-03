import { test } from "vitest";
import { getJsonResponse } from "../../../__test-utils__";

// TODO: Reinstate when .env and .dev.vars files are supported with
// cloudflare.config.ts.
test.skip("reading variables from a staging .env file", async ({ expect }) => {
	expect(await getJsonResponse()).toEqual({
		"variables loaded from .env and .env.staging": {
			MY_DEV_VAR_A: "my .env staging variable A",
			MY_DEV_VAR_B: "my .env staging variable B",
			MY_DEV_VAR_C: "my .env variable C", // Note that unlike .dev.vars, we merge .env files
		},
	});
});
