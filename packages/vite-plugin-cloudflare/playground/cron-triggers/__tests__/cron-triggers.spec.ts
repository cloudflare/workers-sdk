import { expect, test } from "vitest";
import { getTextResponse } from "../../__test-utils__";

test("Email triggers", async () => {
	const rootResponse = await getTextResponse("/");
	expect(rootResponse).toBe("Hello cron trigger Worker playground!");

	const cronResponse = await getTextResponse("/cdn-cgi/handler/scheduled");
	expect(cronResponse).toBe("ok");
});
