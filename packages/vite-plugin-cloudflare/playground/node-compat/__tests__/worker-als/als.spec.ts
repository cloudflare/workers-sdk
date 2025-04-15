import { expect, test } from "vitest";
import { getTextResponse, serverLogs } from "../../../__test-utils__";

test("supports Node.js ALS mode", async () => {
	const result = await getTextResponse();
	// It won't log any node.js compat warnings
	expect(serverLogs.warns).toEqual([]);
	expect(result).toEqual("OK!");
});
