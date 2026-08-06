import { test, vi } from "vitest";
import { getTextResponse, WAIT_FOR_OPTIONS } from "../../../__test-utils__";

test("imports node.js builtins without the nodejs_compat flag when the compatibility date implies it", async ({
	expect,
}) => {
	await vi.waitFor(
		async () => expect(await getTextResponse()).toEqual(`"OK!"`),
		WAIT_FOR_OPTIONS
	);
});
