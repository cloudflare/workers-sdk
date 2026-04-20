import { test } from "vitest";
import { serverLogs } from "../../../__test-utils__";

test("basic dev logging with logLevel: error", async ({ expect }) => {
	expect(serverLogs.info.join()).toEqual("");
	expect(serverLogs.warns.join()).toEqual("");

	expect(serverLogs.errors.join()).toContain("__console error__");

	// Historically we've been printing warnings as errors, that's why we also include the following check
	expect(serverLogs.errors.join()).not.toContain("__console warn__");
});
