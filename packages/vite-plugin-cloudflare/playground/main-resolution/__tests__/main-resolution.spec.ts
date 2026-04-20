import { test } from "vitest";
import { getJsonResponse } from "../../__test-utils__";

test("resolves `main` relative to a root level Worker config", async ({
	expect,
}) => {
	expect(await getJsonResponse()).toEqual({
		entry: "Root config",
		imported: "Root config import",
	});
});
