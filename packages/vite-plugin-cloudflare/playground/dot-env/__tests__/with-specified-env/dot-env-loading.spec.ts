import { test } from "vitest";
import { getJsonResponse } from "../../../__test-utils__";

test("merges Worker secrets from .env and .env.staging", async ({ expect }) => {
	expect(await getJsonResponse()).toEqual({
		"variables loaded from .env and .env.staging": {
			MY_DEV_VAR_A: "my .env staging variable A",
			MY_DEV_VAR_B: "my .env staging variable B",
			MY_DEV_VAR_C: "my .env variable C",
		},
	});
});
