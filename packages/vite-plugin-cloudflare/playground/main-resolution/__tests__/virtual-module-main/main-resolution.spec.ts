import { expect, test } from "vitest";
import { getTextResponse } from "../../../__test-utils__";

test("supports virtual modules in the `main` field", async () => {
	expect(await getTextResponse()).toBe("Virtual module as Worker entry file");
});
