import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { isBuild, page, rootDir } from "../../../__test-utils__";

describe.runIf(isBuild)("output directories", () => {
	test("creates the correct output directories", () => {
		expect(
			fs.existsSync(path.join(rootDir, "custom-root-output-directory", "api"))
		).toBe(true);
		expect(
			fs.existsSync(path.join(rootDir, "custom-client-output-directory"))
		).toBe(true);
	});
});

test("returns the correct home page", async () => {
	const content = await page.textContent("h1");
	expect(content).toBe("Vite + React");
});

test("returns the response from the API", async () => {
	const button = page.getByRole("button", { name: "get-name" });
	const contentBefore = await button.innerText();
	expect(contentBefore).toBe("Name from API is: unknown");
	const responsePromise = page.waitForResponse((response) =>
		response.url().endsWith("/api/")
	);
	await button.click();
	await responsePromise;
	const contentAfter = await button.innerText();
	expect(contentAfter).toBe("Name from API is: Cloudflare");
});
