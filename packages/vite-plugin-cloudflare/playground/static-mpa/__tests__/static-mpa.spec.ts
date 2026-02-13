import * as fs from "node:fs";
import * as path from "node:path";
import { describe, test } from "vitest";
import {
	getResponse,
	isBuild,
	page,
	rootDir,
	serverLogs,
	viteTestUrl,
} from "../../__test-utils__";

test("returns the correct home page", async ({ expect }) => {
	const content = await page.textContent("h1");
	expect(content).toBe("Home");
});

test("returns the correct contact page", async ({ expect }) => {
	await page.goto(`${viteTestUrl}/contact`);
	const content = await page.textContent("h1");
	expect(content).toBe("Contact");
});

test("returns the correct about page", async ({ expect }) => {
	await page.goto(`${viteTestUrl}/about`);
	const content = await page.textContent("h1");
	expect(content).toBe("About");
});

test("returns the correct canonical URL", async ({ expect }) => {
	await page.goto(`${viteTestUrl}/about`);
	const url = page.url();
	expect(url).toBe(`${viteTestUrl}/about/`);
});

test("returns the correct root 404 page", async ({ expect }) => {
	await page.goto(`${viteTestUrl}/random-page`);
	const content = await page.textContent("h1");
	expect(content).toBe("Root 404");
});

test("returns the correct nested 404 page", async ({ expect }) => {
	await page.goto(`${viteTestUrl}/about/random-page`);
	const content = await page.textContent("h1");
	expect(content).toBe("About 404");
});

test("returns HTML files in the public directory and prioritizes them over root level HTML files", async ({
	expect,
}) => {
	await page.goto(`${viteTestUrl}/public-html`);
	const content = await page.textContent("h1");
	expect(content).toBe("Public Directory HTML");
});

test("does not return HTML files in the public directory if the public directory is included in the path", async ({
	expect,
}) => {
	await page.goto(`${viteTestUrl}/public/public-html`);
	const content = await page.textContent("h1");
	expect(content).toBe("Root 404");
});

test("worker configs warnings are not present in the terminal", async ({
	expect,
}) => {
	expect(serverLogs.warns.join()).not.toContain(
		"contains the following configuration options which are ignored since they are not applicable when using Vite"
	);
});

describe.runIf(isBuild)("_headers", () => {
	test("applies exact headers", async ({ expect }) => {
		const response = await getResponse("/contact");
		const header = await response.headerValue("X-Header");
		expect(header).toBe("exact-header");
	});

	test("applies splat headers", async ({ expect }) => {
		const response = await getResponse("/vite.svg");
		const header = await response.headerValue("X-Header");
		expect(header).toBe("splat-header");
	});
});

describe.runIf(isBuild)("_redirects", () => {
	test("applies exact redirects", async ({ expect }) => {
		await page.goto(`${viteTestUrl}/home`);
		const content = await page.textContent("h1");
		expect(content).toBe("Home");
	});

	test("applies splat redirects", async ({ expect }) => {
		await page.goto(`${viteTestUrl}/contact/random-page`);
		const content = await page.textContent("h1");
		expect(content).toBe("Contact");
	});

	test("applies redirects if an asset exists at the 'from' path", async ({
		expect,
	}) => {
		await page.goto(`${viteTestUrl}/text-file.txt`);
		const content = await page.textContent("h1");
		expect(content).toBe("Home");
	});
});

test.runIf(isBuild)(
	"emits .assetsignore file in client output directory",
	({ expect }) => {
		expect(
			fs.readFileSync(path.join(rootDir, "dist", ".assetsignore"), "utf-8")
		).toBe(`wrangler.json\n.dev.vars\n`);
	}
);
