import { expect, test } from "vitest";
import { isBuild, page, serverLogs, viteTestUrl } from "../../__test-utils__";

test.runIf(!isBuild)("client receives custom events", async () => {
	await page.goto(viteTestUrl);
	expect(serverLogs.info.join()).toContain("__server-event-data-received__");
});

test.runIf(!isBuild)("server receives custom events", async () => {
	await page.goto(viteTestUrl);
	expect(serverLogs.info.join()).toContain("__client-event-data-received__");
});
