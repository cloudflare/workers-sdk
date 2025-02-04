import { expect, test } from "vitest";
import { getJsonResponse, isBuild } from "../../__test-utils__";

test.runIf(isBuild)("imports and instantiates WebAssembly", async () => {
	const result = await getJsonResponse();
	expect(result).toEqual({ result: 7 });
});
