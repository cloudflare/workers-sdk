import { expect, test } from "vitest";
import { getJsonResponse } from "../../__test-utils__";

test("imports and instantiates WebAssembly", async () => {
	const result = await getJsonResponse();
	expect(result).toEqual({ result: 7 });
});
