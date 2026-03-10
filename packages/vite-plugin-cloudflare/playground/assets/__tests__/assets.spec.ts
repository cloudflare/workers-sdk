import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "vitest";
import {
	getResponse,
	isBuild,
	page,
	rootDir,
	viteTestUrl,
} from "../../__test-utils__";
import "./base-tests";

test("fetches transformed HTML asset", async ({ expect }) => {
	await page.goto(`${viteTestUrl}/transformed-html-asset`);
	const content = await page.textContent("h1");
	expect(content).toBe("Modified content");
});

test("fetches original public directory asset if requested directly", async ({
	expect,
}) => {
	const response = await getResponse("/public-image.svg");
	const contentType = await response.headerValue("content-type");
	const additionalHeader = await response.headerValue("additional-header");
	expect(contentType).toBe("image/svg+xml");
	expect(additionalHeader).toBe(null);
});

test("fetches original HTML asset if requested directly", async ({
	expect,
}) => {
	await page.goto(`${viteTestUrl}/html-page`);
	const content = await page.textContent("h1");
	expect(content).toBe("Original content");
});

test.runIf(isBuild)(
	"emits .assetsignore in client output directory merged with defaults",
	({ expect }) => {
		expect(
			fs.readFileSync(
				path.join(rootDir, "dist", "client", ".assetsignore"),
				"utf-8"
			)
		).toBe(`test-file.txt\n*.bak\nwrangler.json\n.dev.vars\n`);
	}
);
