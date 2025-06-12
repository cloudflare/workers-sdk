import { expect, test } from "vitest";
import {
	getJsonResponse,
	getResponse,
	getTextResponse,
	isBuild,
	viteTestUrl,
} from "../../../__test-utils__";
import "../base-tests";

test("returns the home page directly without invoking the Worker", async () => {
	const response = await getResponse();
	expect(await response.headerValue("content-type")).toContain("text/html");
	expect(await response.headerValue("is-worker-response")).toBe(null);
});

test("returns the Worker API response for navigation request ('sec-fetch-mode: navigate' header included) if positive rule included in `run_worker_first`", async () => {
	const json = await getJsonResponse("/api/");
	expect(json).toEqual({ name: "Cloudflare" });
});

test("returns the Worker API response for non-navigation request ('sec-fetch-mode: navigate' header not included) if positive rule included in `run_worker_first`", async () => {
	const response = await fetch(`${viteTestUrl}/api/`);
	expect(response.status).toBe(200);
	const json = await response.json();
	expect(json).toEqual({ name: "Cloudflare" });
});

// We skip this test in build as we don't know the asset path. This is OK as the asset is handled by Miniflare rather than Vite in preview
test.skipIf(isBuild)(
	"returns the asset in dev for navigation request if negative rule included in `run_worker_first",
	async () => {
		const text = await getTextResponse("/api/asset.txt");
		expect(text).toBe("Asset content.\n");
	}
);

test("returns the modfied asset response if positive rule included in `run_worker_first`", async () => {
	const text = await getTextResponse("/api/asset");
	expect(text).toBe("Modified: Asset content.\n");
});

test("returns the home page for not found route on non-navigation request ('sec-fetch-mode: navigate' header not included)", async () => {
	const response = await fetch(`${viteTestUrl}/foo`);
	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toContain("text/html");
	expect(response.headers.get("is-worker-response")).toBe(null);
});

test.skipIf(isBuild)(
	"returns the API response for API route when the route matches a file in dev",
	async () => {
		const json = await getJsonResponse("/api/some-file.txt");
		expect(json).toEqual({ name: "Cloudflare" });
	}
);
