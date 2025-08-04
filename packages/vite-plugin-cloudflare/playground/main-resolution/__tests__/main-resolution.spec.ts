import { expect, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

test("resolves `main` relative to a root level Worker config", async () => {
	expect(await getTextResponse()).toEqual("Root level Worker entry");
});
