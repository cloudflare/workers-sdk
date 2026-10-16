import { test } from "vitest";
import { getTextResponse, serverLogs } from "../../__test-utils__";

test("Supports testing Cron Triggers", async ({ expect }) => {
	const cronResponse = await getTextResponse("/cdn-cgi/local/scheduled");
	expect(cronResponse).toBe("ok");
	expect(serverLogs.info.join()).toContain("Cron processed");
});
