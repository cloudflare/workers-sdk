import { test } from "vitest";
import { serverLogs } from "../../../__test-utils__";

test("basic dev logging with logLevel: silent", async ({ expect }) => {
	expect(serverLogs.info.join()).toEqual("");
	expect(serverLogs.warns.join()).toEqual("");
	expect(serverLogs.errors.join()).toEqual("");
});
