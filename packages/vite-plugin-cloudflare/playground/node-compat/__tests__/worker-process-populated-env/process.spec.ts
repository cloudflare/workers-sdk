import { expect, test } from "vitest";
import { getTextResponse } from "../../../__test-utils__";

test("should get a populated process.env object", async () => {
	const result = await getTextResponse();
	expect(result).toBe(`OK!`);
});
