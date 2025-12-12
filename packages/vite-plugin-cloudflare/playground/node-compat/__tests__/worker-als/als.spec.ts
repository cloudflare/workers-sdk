import { expect, test, vi } from "vitest";
import {
	getTextResponse,
	isVite8,
	serverLogs,
	WAIT_FOR_OPTIONS,
} from "../../../__test-utils__";

test.skipIf(isVite8)("supports Node.js ALS mode", async () => {
	await vi.waitFor(
		async () => expect(await getTextResponse()).toEqual("OK!"),
		WAIT_FOR_OPTIONS
	);
	// It won't log any node.js compat warnings
	expect(serverLogs.warns).toEqual([]);
});
