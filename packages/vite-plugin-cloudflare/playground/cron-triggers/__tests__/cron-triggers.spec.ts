import { describe, test } from "vitest";
import { getTextResponse, serverLogs } from "../../__test-utils__";

describe.each(["/cdn-cgi/local/scheduled", "/cdn-cgi/handler/scheduled"])(
	"%s",
	(path) => {
		test("Supports testing Cron Triggers", async ({ expect }) => {
			const cronResponse = await getTextResponse(path);
			expect(cronResponse).toBe("ok");
			expect(serverLogs.info.join()).toContain("Cron processed");
		});
	}
);
