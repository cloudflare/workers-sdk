import { expect, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

test("returns value from virtual module", async () => {
	expect(await getTextResponse()).toEqual("virtual module");
});
