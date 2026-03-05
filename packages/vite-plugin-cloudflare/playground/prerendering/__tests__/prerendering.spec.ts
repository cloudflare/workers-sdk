import { test } from "vitest";
import {
	getTextResponse,
	isBuild,
	page,
	satisfiesViteVersion,
	viteTestUrl,
} from "../../__test-utils__";

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

test.runIf(isBuild && satisfiesViteVersion("7.0.0"))(
	"does not return a server rendered response at /hello after the build",
	async ({ expect }) => {
		const response = await fetch(`${viteTestUrl}/hello`);
		expect(response.status).toBe(404);
	}
);

test.runIf(isBuild && satisfiesViteVersion("7.0.0"))(
	"returns the prerendered route at /prerendered after the build",
	async ({ expect }) => {
		await page.goto(`${viteTestUrl}/prerendered`);
		const content = await page.textContent("h1");
		expect(content).toBe("Pre-rendered HTML");
	}
);
