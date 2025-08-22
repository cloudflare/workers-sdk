import { expect, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

test("supports testing Cron Triggers at /cdn-cgi/handler/scheduled route", async () => {
	const rootResponse = await getTextResponse("/");
	expect(rootResponse).toBe("Hello cron trigger Worker playground!");

	const cronResponse = await getTextResponse("/cdn-cgi/handler/scheduled");
	expect(cronResponse).toBe("ok");
});
