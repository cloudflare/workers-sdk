import { test, describe } from "vitest";
import "../base-tests";
import { viteTestUrl } from "../../../__test-utils__";

describe("assets-only", () => {
	// TODO: Reinstate when prerender Workers are supported by Build Output preview.
	test.skip("does not return a server rendered response at /hello after the build", async ({
		expect,
	}) => {
		const response = await fetch(`${viteTestUrl}/hello`);
		expect(response.status).toBe(404);
	});
});
