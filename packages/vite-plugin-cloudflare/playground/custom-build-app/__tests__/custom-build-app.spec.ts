import { expect, test } from "vitest";
import { getTextResponse, isBuild, serverLogs } from "../../__test-utils__";

test("returns the correct response", async () => {
	expect(await getTextResponse()).toEqual("Hello World!");
});

test.runIf(isBuild)("runs a custom buildApp function", async () => {
	expect(serverLogs.info.join()).toContain("__before-build__");
	expect(serverLogs.info.join()).toContain("__after-build__");
});
