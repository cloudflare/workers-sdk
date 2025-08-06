import { expect, test } from "vitest";
import { getJsonResponse } from "../../../__test-utils__";

test("resolves `main` relative to a nested Worker config", async () => {
	expect(await getJsonResponse()).toEqual({
		entry: "Nested config",
		import: "Nested config import",
	});
});
