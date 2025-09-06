import path from "path";
import dedent from "ts-dedent";
import { defaultWranglerConfig } from "../config/config";
import { getEntry } from "../deployment-bundle/entry";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { seed } from "./helpers/seed";
import type { Entry } from "../deployment-bundle/entry";

function normalize(entry: Entry): Entry {
	const tmpDir = process.cwd();
	const tmpDirName = path.basename(tmpDir);

	return Object.fromEntries(
		Object.entries(entry).map(([k, v]) => [
			k,
			typeof v === "string"
				? v
						.replaceAll("\\", "/")
						.replace(new RegExp(`(.*${tmpDirName})`), `/tmp/dir`)
				: v,
		])
	) as Entry;
}

describe("getEntry()", () => {
	runInTempDir();
	mockConsoleMethods();

	it("--script index.ts", async () => {
		await seed({
			"index.ts": dedent/* javascript */ `
							export default {
								fetch() {

								}
							}
						`,
		});
		const entry = await getEntry(
			{ script: "index.ts" },
			defaultWranglerConfig,
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
			projectRoot: "/tmp/dir",
			file: "/tmp/dir/index.ts",
			moduleRoot: "/tmp/dir",
		});
	});

	it("--script src/index.ts", async () => {
		await seed({
			"src/index.ts": dedent/* javascript */ `
							export default {
								fetch() {

								}
							}
						`,
		});
		const entry = await getEntry(
			{ script: "src/index.ts" },
			defaultWranglerConfig,
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
			projectRoot: "/tmp/dir",
			file: "/tmp/dir/src/index.ts",
			moduleRoot: "/tmp/dir/src",
		});
	});

	it("main = index.ts", async () => {
		await seed({
			"index.ts": dedent/* javascript */ `
							export default {
								fetch() {

								}
							}
						`,
		});
		const entry = await getEntry(
			{},
			{ ...defaultWranglerConfig, main: "index.ts" },
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
			projectRoot: "/tmp/dir",
			file: "/tmp/dir/index.ts",
			moduleRoot: "/tmp/dir",
		});
	});

	it("main = src/index.ts", async () => {
		await seed({
			"src/index.ts": dedent/* javascript */ `
							export default {
								fetch() {

								}
							}
						`,
		});
		const entry = await getEntry(
			{},
			{ ...defaultWranglerConfig, main: "src/index.ts" },
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
			projectRoot: "/tmp/dir",
			file: "/tmp/dir/src/index.ts",
			moduleRoot: "/tmp/dir/src",
		});
	});

	it("main = src/index.ts w/ configPath", async () => {
		await seed({
			"other-worker/src/index.ts": dedent/* javascript */ `
							export default {
								fetch() {

								}
							}
						`,
		});
		const entry = await getEntry(
			{},
			{
				...defaultWranglerConfig,
				main: "src/index.ts",
				configPath: "other-worker/wrangler.toml",
				userConfigPath: "other-worker/wrangler.toml",
			},
			"deploy"
		);
		expect(normalize(entry)).toMatchObject({
			projectRoot: "/tmp/dir/other-worker",
			file: "/tmp/dir/other-worker/src/index.ts",
			moduleRoot: "/tmp/dir/other-worker/src",
		});
	});

	describe("error messages with asset directory suggestions", () => {
		it("should suggest single detected asset directory", async () => {
			await seed({
				"dist/index.html": "<html></html>",
				"dist/style.css": "body { color: red; }",
			});

			await expect(
				getEntry({}, defaultWranglerConfig, "deploy")
			).rejects.toThrow(
				/We noticed that there is a directory called `\.\/dist` in your project \(common build output directory\)\. If you are trying to deploy the contents of that directory to Cloudflare, please run:/
			);
		});

		it("should suggest multiple detected asset directories", async () => {
			await seed({
				"dist/index.html": "<html></html>",
				"build/app.js": "console.log('hello');",
				"public/favicon.ico": "fake-ico-content",
			});

			await expect(
				getEntry({}, defaultWranglerConfig, "deploy")
			).rejects.toThrow(
				/We noticed several directories that might contain static assets:/
			);

			await expect(
				getEntry({}, defaultWranglerConfig, "deploy")
			).rejects.toThrow(
				/- `\.\/build` \(common build output directory\)/
			);

			await expect(
				getEntry({}, defaultWranglerConfig, "deploy")
			).rejects.toThrow(
				/- `\.\/dist` \(common build output directory\)/
			);

			await expect(
				getEntry({}, defaultWranglerConfig, "deploy")
			).rejects.toThrow(
				/- `\.\/public` \(common static assets directory\)/
			);
		});

		it("should suggest framework-specific directories", async () => {
			await seed({
				"package.json": JSON.stringify({
					name: "my-astro-project",
					dependencies: {
						astro: "^4.0.0",
					},
				}),
				"astro.config.mjs": "export default {};",
				"dist/index.html": "<html></html>",
			});

			await expect(
				getEntry({}, defaultWranglerConfig, "deploy")
			).rejects.toThrow(
				/We noticed that there is a directory called `\.\/dist` in your project \(detected astro\.config project\)/
			);
		});

		it("should not suggest asset directories when none exist", async () => {
			await seed({
				"src/some-file.ts": "export default {};",
			});

			await expect(
				getEntry({}, defaultWranglerConfig, "deploy")
			).rejects.toThrow(
				/Missing entry-point to Worker script or to assets directory/
			);

			// Should not contain asset directory suggestions
			await expect(
				getEntry({}, defaultWranglerConfig, "deploy")
			).rejects.not.toThrow(/We noticed/);
		});

		it("should not suggest empty directories", async () => {
			await seed({
				"dist/": "", // Creates empty directory
			});

			await expect(
				getEntry({}, defaultWranglerConfig, "deploy")
			).rejects.toThrow(
				/Missing entry-point to Worker script or to assets directory/
			);

			// Should not contain asset directory suggestions
			await expect(
				getEntry({}, defaultWranglerConfig, "deploy")
			).rejects.not.toThrow(/We noticed/);
		});
	});
});
