import { expect, test } from "vitest";
import { getTextResponse, serverLogs, viteTestUrl } from "../../__test-utils__";

test("basic hello-world functionality", async () => {
	expect(await getTextResponse()).toEqual("Hello World!");
});

test("basic dev logging", async () => {
	expect(serverLogs.info.join()).toContain("__console log__");
	expect(serverLogs.errors.join()).toContain("__console error__");
	expect(serverLogs.errors.join()).toContain("__console warn__");
});

test("receives the original host as the `X-Forwarded-Host` header", async () => {
	const testUrl = new URL(viteTestUrl);
	const response = await getTextResponse("/x-forwarded-host");
	expect(response).toBe(testUrl.host);
});
