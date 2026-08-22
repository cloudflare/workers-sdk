import * as fs from "node:fs";
import * as path from "node:path";
import { test, describe } from "vitest";
import {
	getTextResponse,
	isBuild,
	page,
	rootDir,
	viteTestUrl,
} from "../../__test-utils__";

describe("pre-rendering", () => {
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
			expect(content).toBe("Pre-rendered HTML from auxiliary Worker");
		}
	);

	test.runIf(isBuild)(
		"emits the prerender Worker in Build Output",
		({ expect }) => {
			const workerDir = path.join(
				rootDir,
				".cloudflare/output/v0/workers/prerender"
			);
			const config = JSON.parse(
				fs.readFileSync(path.join(workerDir, "config.json"), "utf-8")
			) as { manifest: { mainModule: string } };

			expect(
				fs.existsSync(
					path.join(workerDir, "bundle", config.manifest.mainModule)
				)
			).toBe(true);
		}
	);
});
