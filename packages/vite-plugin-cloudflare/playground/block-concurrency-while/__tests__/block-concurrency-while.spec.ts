import { expect, test } from "vitest";

import { getJsonResponse } from "../../__test-utils__";

test("blocks execution until `ctx.blockConcurrencyWhile` has completed", async () => {
	const response = await getJsonResponse("/durable-object");
	expect(response).toEqual({ isInitialized: true });
});
