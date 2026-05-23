import { test } from "vitest";
import { getTextResponse, serverLogs } from "../../__test-utils__";

test("Supports testing Cron Triggers at '/cdn-cgi/handler/scheduled' route", async ({
	expect,
}) => {
	const cronResponse = await getTextResponse("/cdn-cgi/handler/scheduled");
	expect(cronResponse).toBe("ok");
	expect(serverLogs.info.join()).toContain("Cron processed");
});

test("Supports testing Cron Triggers at the '/__scheduled' alias", async ({
	expect,
}) => {
	const cronResponse = await getTextResponse(
		"/__scheduled?time=0&cron=*+*+*+*+*"
	);
	expect(cronResponse).toBe("ok");
	expect(serverLogs.info.join()).toContain("Cron processed");
});
