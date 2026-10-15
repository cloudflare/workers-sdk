import { describe, test } from "vitest";
import { getResponse, isBuild, viteTestUrl } from "../../../__test-utils__";
import { runBaseTests } from "../base-tests";

// Covers Vite's dev-only `base` handling, which strips the base before Vite's
// module middlewares run
describe.skipIf(isBuild)("run_worker_first with a non-root base", () => {
	runBaseTests();

	test("returns the home page via the Worker", async ({ expect }) => {
		expect(viteTestUrl).toContain("/custom-mount");
		const response = await getResponse();
		expect(await response.headerValue("content-type")).toContain("text/html");
		expect(await response.headerValue("is-worker-response")).toBe("true");
	});

	test("serves Vite's module URLs under the base before the Worker", async ({
		expect,
	}) => {
		// `viteTestUrl` already includes the `/custom-mount` base
		for (const pathname of ["/@vite/client", "/src/main.tsx"]) {
			const response = await fetch(`${viteTestUrl}${pathname}`);
			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toContain("text/javascript");
			expect(response.headers.get("is-worker-response")).toBeNull();
		}
	});

	test("passes the full URL to the Worker for unhandled requests under the base", async ({
		expect,
	}) => {
		const response = await fetch(`${viteTestUrl}/foo`);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/html");
		expect(response.headers.get("is-worker-response")).toBe("true");
	});
});
