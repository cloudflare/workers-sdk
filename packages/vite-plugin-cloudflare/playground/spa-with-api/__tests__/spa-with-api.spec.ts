import * as fs from "node:fs";
import * as path from "node:path";
import { expect, test } from "vitest";
import {
	getResponse,
	getTextResponse,
	isBuild,
	page,
	rootDir,
	viteTestUrl,
} from "../../__test-utils__";
import "./base-tests";

export const browserMode = true;

test("returns the home page directly without invoking the Worker", async () => {
	const response = await getResponse();
	expect(response.headers.get("content-type")).toContain("text/html");
	expect(response.headers.get("is-worker-response")).toBe(null);
});

test("returns the home page for not found route on navigation request ('sec-fetch-mode: navigate' header included)", async () => {
	await page.goto(`${viteTestUrl}/api/`);
	const content = await page.textContent("h1");
	expect(content).toBe("Vite + React");
});

test("returns the Worker API response for API route on non-navigation request ('sec-fetch-mode: navigate' header not included)", async () => {
	const response = await fetch(`${viteTestUrl}/api/`);
	expect(response.status).toBe(200);
	const json = await response.json();
	expect(json).toEqual({ name: "Cloudflare" });
});

test("returns the Worker fallback response for not found route on non-navigation request ('sec-fetch-mode: navigate' header not included)", async () => {
	const response = await fetch(`${viteTestUrl}/foo`);
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toContain("text/html");
	expect(response.headers.get("is-worker-response")).toBe("true");
});

test.runIf(!isBuild)(
	"returns the file for API route when the route matches a file in dev",
	async () => {
		const text = await getTextResponse("/api/some-file.txt");
		expect(text).toBe(`Some file content.\n`);
	}
);

test.runIf(isBuild)(
	"emits .assetsignore file in client output directory",
	() => {
		expect(
			fs.readFileSync(
				path.join(rootDir, "dist", "client", ".assetsignore"),
				"utf-8"
			)
		).toBe(`wrangler.json\n.dev.vars\n`);
	}
);
