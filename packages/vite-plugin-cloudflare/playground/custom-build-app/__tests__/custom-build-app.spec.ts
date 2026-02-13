import { test } from "vitest";
import {
	getTextResponse,
	isBuild,
	page,
	serverLogs,
} from "../../__test-utils__";

test("returns the index.html page", async ({ expect }) => {
	const content = await page.textContent("h1");
	expect(content).toBe("HTML page");
});

test("returns the Worker response", async ({ expect }) => {
	const response = await getTextResponse("/another-path");
	expect(response).toBe("Worker response");
});

test.runIf(isBuild)("runs a custom buildApp function", async ({ expect }) => {
	expect(serverLogs.info.join()).toContain("__before-build__");
	expect(serverLogs.info.join()).toContain("__after-build__");
});
