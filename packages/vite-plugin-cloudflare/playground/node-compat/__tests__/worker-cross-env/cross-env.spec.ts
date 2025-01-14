import { expect, test } from "vitest";
import { getTextResponse } from "../../../__test-utils__";

test("import unenv aliased 3rd party packages (e.g. cross-env)", async () => {
	const result = await getTextResponse();
	expect(result).toBe(`"OK!"`);
});
