import { expect, test } from "vitest";
import { getJsonResponse } from "../../__test-utils__";

test("resolves `main` relative to a root level Worker config", async () => {
	expect(await getJsonResponse()).toEqual({
		entry: "Root config",
		import: "Root config import",
	});
});
