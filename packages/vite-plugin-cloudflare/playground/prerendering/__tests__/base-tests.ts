import { test, describe } from "vitest";
import {
	getTextResponse,
	isBuild,
	page,
	viteTestUrl,
} from "../../__test-utils__";

describe("pre-rendering", () => {
	test.runIf(!isBuild)(
		"returns the server rendered response at /hello in dev",
		async ({ expect }) => {
			expect(await getTextResponse("/hello")).toEqual("Hello world");
		}
	);

	// TODO: Reinstate when prerender Workers are supported by Build Output preview.
	test.skip("returns the prerendered route at /prerendered after the build", async ({
		expect,
	}) => {
		await page.goto(`${viteTestUrl}/prerendered`);
		const content = await page.textContent("h1");
		expect(content).toBe("Pre-rendered HTML");
	});
});
