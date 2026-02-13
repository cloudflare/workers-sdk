import { describe, test } from "vitest";
import { isBuild, page, serverLogs, viteTestUrl } from "../../__test-utils__";

describe.runIf(!isBuild)("hot-channel", () => {
	test("receives custom events sent from the dev server to the Worker", async ({
		expect,
	}) => {
		await page.goto(viteTestUrl);
		expect(serverLogs.info.join()).toContain("__server-event-data-received__");
	});

	test("receives custom events sent from the Worker module scope to the dev server", async ({
		expect,
	}) => {
		await page.goto(viteTestUrl);
		expect(serverLogs.info.join()).toContain(
			"__worker-module-event-data-received__"
		);
	});

	test("receives custom events sent from the Worker request scope to the dev server", async ({
		expect,
	}) => {
		await page.goto(viteTestUrl);
		expect(serverLogs.info.join()).toContain(
			"__worker-request-event-data-received__"
		);
	});
});
