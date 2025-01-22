import { expect, test } from "vitest";
import { getJsonResponse, isBuild } from "../../__test-utils__";

// TODO: currently this does not work on previews because after the config redirection
//       wrangler looses track of the original .dev.vars, we need to somehow address such
//       use case (so that people are able to preview their workers using secrets)

test.skipIf(isBuild)(
	"reading variables from a standard .dev.vars file",
	async () => {
		expect(await getJsonResponse()).toEqual({
			"variables present in .dev.vars": {
				MY_DEV_VAR_A: "my .dev.vars variable A",
				MY_DEV_VAR_B: "my .dev.vars variable B",
				MY_DEV_VAR_C: "my .dev.vars variable C",
			},
		});
	}
);
