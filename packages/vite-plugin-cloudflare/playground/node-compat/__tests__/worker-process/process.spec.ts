import { expect, test } from "vitest";
import { getTextResponse } from "../../../__test-utils__";

test("should support process global", async () => {
	const result = await getTextResponse();
	expect(result).toBe(`OK!`);
});
