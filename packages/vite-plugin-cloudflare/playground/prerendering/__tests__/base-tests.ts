import * as fs from "node:fs";
import * as path from "node:path";
import { test, describe } from "vitest";
import {
	getTextResponse,
	isBuild,
	page,
	satisfiesMinimumViteVersion,
	testDir,
	viteTestUrl,
} from "../../__test-utils__";

describe.runIf(satisfiesMinimumViteVersion("7.0.0"))("pre-rendering", () => {
	test.runIf(!isBuild)(
		"returns the server rendered response at /hello in dev",
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

	test.runIf(isBuild)(
		"keeps using declarations in the prerender Worker build",
		async ({ expect }) => {
			const output = fs.readFileSync(
				path.join(testDir, "dist", "prerender", "index.js"),
				"utf-8"
			);
			expect(output).toMatch(/\busing [\w$]+ =/);
			expect(output).not.toMatch(/__using|_usingCtx/);
		}
	);
});
