import { test, describe } from "vitest";
import "./base-tests";
import { viteTestUrl } from "../../__test-utils__";

describe("with-ssr", () => {
	// TODO: Reinstate when prerender Workers are supported by Build Output preview.
	test.skip("returns a server rendered response at /hello after the build", async ({
		expect,
	}) => {
		const response = await fetch(`${viteTestUrl}/hello`);
		expect(response.status).toBe(200);
	});
});
