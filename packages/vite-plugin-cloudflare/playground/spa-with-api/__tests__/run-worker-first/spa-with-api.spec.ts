import { test } from "vitest";
import {
	getJsonResponse,
	getResponse,
	getTextResponse,
	isBuild,
	viteTestUrl,
} from "../../../__test-utils__";
import "../base-tests";

test("returns the home page via the Worker", async ({ expect }) => {
	const response = await getResponse();
	expect(await response.headerValue("content-type")).toContain("text/html");
	expect(await response.headerValue("is-worker-response")).toBe("true");
});

test("returns the Worker API response for matching navigation request ('sec-fetch-mode: navigate' header included)", async ({
	expect,
}) => {
	const json = await getJsonResponse("/api/");
	expect(json).toEqual({ name: "Cloudflare" });
});

test("returns the Worker API response for matching non-navigation request ('sec-fetch-mode: navigate' header not included)", async ({
	expect,
}) => {
	const response = await fetch(`${viteTestUrl}/api/`);
	expect(response.status).toBe(200);
	const json = await response.json();
	expect(json).toEqual({ name: "Cloudflare" });
});

test("returns the Worker asset response for matching request", async ({
	expect,
}) => {
	const text = await getTextResponse("/api/asset");
	expect(text).toBe("Modified: Asset content.\n");
});

test("returns the Worker fallback response for not found route on navigation request ('sec-fetch-mode: navigate' header included)", async ({
	expect,
}) => {
	const response = await getResponse("/foo");
	expect(response.status()).toBe(200);
	expect(await response.headerValue("content-type")).toContain("text/html");
	expect(await response.headerValue("is-worker-response")).toBe("true");
});

test("returns the Worker fallback response for not found route on non-navigation request ('sec-fetch-mode: navigate' header not included)", async ({
	expect,
}) => {
	const response = await fetch(`${viteTestUrl}/foo`);
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toContain("text/html");
	expect(response.headers.get("is-worker-response")).toBe("true");
});

test.skipIf(isBuild)(
	"returns the Worker API response when the route matches a file in dev",
	async ({ expect }) => {
		const json = await getJsonResponse("/api/some-file.txt");
		expect(json).toEqual({ name: "Cloudflare" });
	}
);
