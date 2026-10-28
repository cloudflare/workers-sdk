import { test } from "vitest";
import { getJsonResponse } from "../../__test-utils__";

test("reads Worker secrets from .env", async ({ expect }) => {
	expect(await getJsonResponse()).toEqual({
		"variables loaded from .env": {
			MY_DEV_VAR_A: "my .env variable A",
			MY_DEV_VAR_B: "my .env variable B",
			MY_DEV_VAR_C: "my .env variable C",
		},
	});
});
