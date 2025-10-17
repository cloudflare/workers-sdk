import { expect, test } from "vitest";
import { serverLogs } from "../../../__test-utils__";

test("basic dev logging with logLevel: warn", async () => {
	expect(serverLogs.info.join()).toEqual("");
	expect(serverLogs.warns.join()).toContain("__console warn__");
	expect(serverLogs.errors.join()).toContain("__console error__");
});
