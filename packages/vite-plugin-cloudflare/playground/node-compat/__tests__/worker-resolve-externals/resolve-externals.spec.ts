import { test, vi } from "vitest";
import {
	getTextResponse,
	isBuild,
	serverLogs,
	WAIT_FOR_OPTIONS,
} from "../../../__test-utils__";

test.skipIf(isBuild)(
	"resolves Node.js external when calling `resolveId` directly",
	async ({ expect }) => {
		await vi.waitFor(async () => {
			expect(await getTextResponse()).toBe(`OK!`);
			expect(serverLogs.info.join()).toContain("__node:dns__");
		}, WAIT_FOR_OPTIONS);
	}
);
