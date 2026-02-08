import { test, vi } from "vitest";
import { getTextResponse, WAIT_FOR_OPTIONS } from "../../../__test-utils__";

test("import unenv aliased 3rd party packages (e.g. cross-env)", async ({
	expect,
}) => {
	await vi.waitFor(
		async () => expect(await getTextResponse()).toBe(`"OK!"`),
		WAIT_FOR_OPTIONS
	);
});
