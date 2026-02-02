import { expect, test } from "vitest";
import {
	getTextResponse,
	isBuild,
	page,
	satisfiesViteVersion,
	viteTestUrl,
} from "../../__test-utils__";

export const browserMode = true;

test("returns the server rendered route at /", async () => {
	expect(await getTextResponse()).toEqual("Hello world");
});

test.runIf(isBuild && satisfiesViteVersion("7.0.0"))(
	"returns the prerendered route at /prerendered after the build",
	async () => {
		await page.goto(`${viteTestUrl}/prerendered`);
		const content = await page.textContent("h1");
		expect(content).toBe("Pre-rendered HTML");
	}
);
