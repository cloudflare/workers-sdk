import { expect, test } from "vitest";
import { getJsonResponse } from "../../__test-utils__";

test("calls an RPC method on a named entrypoint in the same worker", async () => {
	const result = await getJsonResponse();
	expect(result).toEqual({ result: 20 });
});
