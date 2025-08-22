import { expect, test } from "vitest";
import { getTextResponse, serverLogs } from "../../__test-utils__";

test("Supports testing Cron Triggers at '/cdn-cgi/handler/scheduled' route", async () => {
	const cronResponse = await getTextResponse("/cdn-cgi/handler/scheduled");
	expect(cronResponse).toBe("ok");
	expect(serverLogs.info.join()).toContain("Cron processed");
});
