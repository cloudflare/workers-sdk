import { expect, test } from "vitest";
import { getTextResponse, serverLogs } from "../../__test-utils__";

test("basic hello-world functionality", async () => {
	expect(await getTextResponse()).toEqual("Hello World!");
});

test("basic dev logging", async () => {
	expect(serverLogs.info.join()).toContain("__console log__");
	expect(serverLogs.errors.join()).toContain("__console error__");
	expect(serverLogs.errors.join()).toContain("__console warn__");
});
