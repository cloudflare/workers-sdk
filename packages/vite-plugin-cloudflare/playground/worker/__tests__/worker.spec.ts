import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test, vi } from "vitest";
import {
	getTextResponse,
	isBuild,
	rootDir,
	serverLogs,
	viteTestUrl,
} from "../../__test-utils__";

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

test("does not cause unhandled rejection", async () => {
	expect(serverLogs.errors.join()).not.toContain("__unhandled rejection__");
});

test.runIf(!isBuild)(
	"updates using HMR code in Worker entry file",
	async () => {
		const workerEntryPath = path.join(rootDir, "src", "index.ts");
		const originalContent = fs.readFileSync(workerEntryPath, "utf-8");
		fs.writeFileSync(workerEntryPath, originalContent);

		await vi.waitFor(() => {
			expect(serverLogs.info.join()).toContain("[vite] hot updated");
		});
	}
);
