import { expect, test } from "vitest";
import { getResponse, serverLogs } from "../../../__test-utils__";

test("basic dev logging with logLevel: warn", async () => {
	await getResponse();

	expect(serverLogs.info.join()).toEqual("");
	expect(serverLogs.warns.join()).toContain("__console warn__");
	expect(serverLogs.errors.join()).toContain("__console error__");
});
