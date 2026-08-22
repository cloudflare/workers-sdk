import { test } from "vitest";
import {
	getResponse,
	getTextResponse,
	isBuild,
	page,
	viteTestUrl,
} from "../../__test-utils__";
import { runBaseTests } from "./base-tests";

runBaseTests();

test("returns the home page directly without invoking the Worker", async ({
	expect,
}) => {
	const response = await getResponse();
	expect(await response.headerValue("content-type")).toContain("text/html");
	expect(await response.headerValue("is-worker-response")).toBe(null);
});

test("returns the home page for not found route on navigation request ('sec-fetch-mode: navigate' header included)", async ({
	expect,
}) => {
	await page.goto(`${viteTestUrl}/api/`);
	const content = await page.textContent("h1");
	expect(content).toBe("Vite + React");
});

// Regression test for the `getTextResponse()` transport. The previous test
// covers a real browser navigation; this one asserts that the helper the rest
// of the playgrounds use is *also* seen as a navigation by the Worker.
//
// It is easy to break: the Fetch spec makes `fetch()` overwrite
// `Sec-Fetch-Mode` with the request's `mode`, so a `fetch()`-based helper
// silently stops exercising `not_found_handling` while still passing every
// other assertion in this file.
test("returns the home page for not found route via `getTextResponse()`", async ({
	expect,
}) => {
	const text = await getTextResponse("/api/");
	expect(text).toContain("<title>Vite + React + TS</title>");
	expect(text).not.toContain("Cloudflare");
});

test("returns the Worker API response for API route on non-navigation request ('sec-fetch-mode: navigate' header not included)", async ({
	expect,
}) => {
	const response = await fetch(`${viteTestUrl}/api/`);
	expect(response.status).toBe(200);
	const json = await response.json();
	expect(json).toEqual({ name: "Cloudflare" });
});

test("returns the Worker fallback response for not found route on non-navigation request ('sec-fetch-mode: navigate' header not included)", async ({
	expect,
}) => {
	const response = await fetch(`${viteTestUrl}/foo`);
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toContain("text/html");
	expect(response.headers.get("is-worker-response")).toBe("true");
});

test.runIf(!isBuild)(
	"returns the file for API route when the route matches a file in dev",
	async ({ expect }) => {
		const text = await getTextResponse("/api/some-file.txt");
		expect(text).toBe(`Some file content.\n`);
	}
);
