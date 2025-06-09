import { expect, test } from "vitest";
import {
	getJsonResponse,
	getTextResponse,
	isBuild,
	viteTestUrl,
} from "../../../__test-utils__";
import "../base-tests";

test("returns the API response for API route on navigation request ('sec-fetch-mode: navigate' header included) if route included in `run_worker_first`", async () => {
	const json = await getJsonResponse("/api/");
	expect(json).toEqual({ name: "Cloudflare" });
});

test("returns the API response for API route on non-navigation request ('sec-fetch-mode: navigate' header not included)", async () => {
	const response = await fetch(`${viteTestUrl}/api/`);
	expect(response.status).toBe(200);
	const json = await response.json();
	expect(json).toEqual({ name: "Cloudflare" });
});

test("returns the API fallback response for not found route on non-navigation request ('sec-fetch-mode: navigate' header not included)", async () => {
	const response = await fetch(`${viteTestUrl}/foo`);
	expect(response.status).toBe(404);
	const json = await response.text();
	expect(json).toBe("Worker fallback response");
});

test.runIf(!isBuild)(
	"returns the API response for API route when the route matches a file",
	async () => {
		const json = await getJsonResponse("/api/some-file.txt");
		expect(json).toEqual({ name: "Cloudflare" });
	}
);
