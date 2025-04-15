import { expect, test } from "vitest";
import { getTextResponse, isBuild, serverLogs } from "../../../__test-utils__";

test.skipIf(isBuild)(
	"resolves Node.js external when calling `resolveId` directly",
	async () => {
		const result = await getTextResponse();
		expect(result).toBe(`OK!`);
		expect(serverLogs.info.join()).toContain("__node:dns__");
	}
);
