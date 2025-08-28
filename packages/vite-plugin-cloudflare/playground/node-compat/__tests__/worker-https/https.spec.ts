import { expect, test } from "vitest";
import { getTextResponse } from "../../../__test-utils__";

test("supports `node:https` module", async () => {
	expect(await getTextResponse()).toBe("OK");
});
