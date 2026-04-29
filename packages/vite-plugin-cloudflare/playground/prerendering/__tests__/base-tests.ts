import { test, describe } from "vitest";
import {
	getTextResponse,
	isBuild,
	page,
	satisfiesMinimumViteVersion,
	viteTestUrl,
} from "../../__test-utils__";

describe.runIf(satisfiesMinimumViteVersion("7.0.0"))("pre-rendering", () => {
	test("returns the static index.html at /", async ({ expect }) => {
		await page.goto(viteTestUrl);
		const content = await page.textContent("h1");
		expect(content).toBe("Static HTML");
	});

	test.runIf(!isBuild)(
		"returns the server rendered response at /hello",
		async ({ expect }) => {
			expect(await getTextResponse("/hello")).toEqual("Hello world");
		}
	);

	test.runIf(isBuild)(
		"returns the prerendered route at /prerendered after the build",
		async ({ expect }) => {
			await page.goto(`${viteTestUrl}/prerendered`);
			const content = await page.textContent("h1");
			expect(content).toBe("Pre-rendered HTML");
		}
	);
});
