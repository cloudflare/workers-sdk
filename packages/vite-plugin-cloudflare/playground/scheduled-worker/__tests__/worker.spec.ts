import { expect, test } from "vitest";
import { getTextResponse, serverLogs, viteTestUrl } from "../../__test-utils__";

test("receives the original host as the `__scheduled` header", async () => {
	const testUrl = new URL(viteTestUrl);
	const response = await getTextResponse("/__scheduled?cron=*+*+*+*+*");
	expect(response).toBe(testUrl.host);
});

test("does not cause unhandled rejection", async () => {
	expect(serverLogs.info.join()).toContain("__console log__");
	expect(serverLogs.errors.join()).toContain("__console error__");
	expect(serverLogs.errors.join()).toContain("__console warn__");
	expect(serverLogs.info.join()).toContain("__wait until__");
	expect(serverLogs.errors.join()).not.toContain("__unhandled rejection__");
});
