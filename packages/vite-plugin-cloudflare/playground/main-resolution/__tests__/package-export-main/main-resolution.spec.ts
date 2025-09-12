import { expect, test } from "vitest";
import { getTextResponse } from "../../../__test-utils__";

test("supports package exports in the `main` field", async () => {
	expect(await getTextResponse()).toBe("Package export as Worker entry file");
});
