import assert from "node:assert";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
import { bundleWorker } from "../deployment-bundle/bundle";
import { noopModuleCollector } from "../deployment-bundle/module-collection";
import { isNavigatorDefined } from "../navigator-user-agent";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

/*
 * This file contains inline comments with the word "javascript"
 * This signals to a compatible editor extension that the template string
 * contents should be syntax-highlighted as JavaScript. One such extension
 * is zjcompt.es6-string-javascript, but there are others.
 */

async function seedFs(files: Record<string, string>): Promise<void> {
	for (const [location, contents] of Object.entries(files)) {
		await mkdir(path.dirname(location), { recursive: true });
		await writeFile(location, contents);
	}
}

describe("isNavigatorDefined", () => {
	test("default", () => {
		expect(isNavigatorDefined(undefined)).toBe(false);
	});

	test("modern date", () => {
		expect(isNavigatorDefined("2024-01-01")).toBe(true);
	});

	test("old date", () => {
		expect(isNavigatorDefined("2000-01-01")).toBe(false);
	});

	test("switch date", () => {
		expect(isNavigatorDefined("2022-03-21")).toBe(true);
	});

	test("before date", () => {
		expect(isNavigatorDefined("2022-03-20")).toBe(false);
	});

	test("old date, but with flag", () => {
		expect(isNavigatorDefined("2000-01-01", ["global_navigator"])).toBe(true);
	});

	test("old date, with disable flag", () => {
		expect(isNavigatorDefined("2000-01-01", ["no_global_navigator"])).toBe(
			false
		);
	});

	test("new date, but with disable flag", () => {
		expect(isNavigatorDefined("2024-01-01", ["no_global_navigator"])).toBe(
			false
		);
	});

	test("new date, with enable flag", () => {
		expect(isNavigatorDefined("2024-01-01", ["global_navigator"])).toBe(true);
	});

	test("errors with disable and enable flags specified", () => {
		try {
			isNavigatorDefined("2024-01-01", [
				"no_global_navigator",
				"global_navigator",
			]);
			assert(false, "Unreachable");
		} catch (e) {
			expect(e).toMatchInlineSnapshot(
				`[Error: Can't both enable and disable a flag]`
			);
		}
	});
});

// Does bundleWorker respect the value of `defineNavigatorUserAgent`?
describe("defineNavigatorUserAgent is respected", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("defineNavigatorUserAgent = false, navigator preserved", async () => {
		await seedFs({
			"src/index.js": dedent/* javascript */ `
			function randomBytes(length) {
				if (navigator.userAgent !== "Cloudflare-Workers") {
					return new Uint8Array(require("node:crypto").randomBytes(length));
				} else {
					return crypto.getRandomValues(new Uint8Array(length));
				}
			}
			export default {
				async fetch(request, env) {
					return new Response(randomBytes(10))
				},
			};
		`,
		});

		await bundleWorker(
			{
				file: path.resolve("src/index.js"),
				directory: process.cwd(),
				format: "modules",
				moduleRoot: path.dirname(path.resolve("src/index.js")),
			},
			path.resolve("dist"),
			{
				bundle: true,
				additionalModules: [],
				moduleCollector: noopModuleCollector,
				serveAssetsFromWorker: false,
				doBindings: [],
				define: {},
				alias: {},
				checkFetch: false,
				targetConsumer: "deploy",
				local: true,
				projectRoot: process.cwd(),
				defineNavigatorUserAgent: false,
			}
		);

		// Build time warning that the dynamic import of `require("node:crypto")` may not be safe
		expect(std.warn).toMatchInlineSnapshot(`
		"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThe package \\"node:crypto\\" wasn't found on the file system but is built into node.[0m

		  Your Worker may throw errors at runtime unless you enable the \\"nodejs_compat\\" compatibility flag.
		  Refer to [4mhttps://developers.cloudflare.com/workers/runtime-apis/nodejs/[0m for more details. Imported
		  from:
		   - src/index.js

		"
	`);
		const fileContents = await readFile("dist/index.js", "utf8");

		// navigator.userAgent should have been preserved as-is
		expect(fileContents).toContain("navigator.userAgent");
	});

	it("defineNavigatorUserAgent = true, navigator treeshaken", async () => {
		await seedFs({
			"src/index.js": dedent/* javascript */ `
			function randomBytes(length) {
				if (navigator.userAgent !== "Cloudflare-Workers") {
					return new Uint8Array(require("node:crypto").randomBytes(length));
				} else {
					return crypto.getRandomValues(new Uint8Array(length));
				}
			}
			export default {
				async fetch(request, env) {
					return new Response(randomBytes(10))
				},
			};
		`,
		});

		await bundleWorker(
			{
				file: path.resolve("src/index.js"),
				directory: process.cwd(),
				format: "modules",
				moduleRoot: path.dirname(path.resolve("src/index.js")),
			},
			path.resolve("dist"),
			{
				bundle: true,
				additionalModules: [],
				moduleCollector: noopModuleCollector,
				serveAssetsFromWorker: false,
				doBindings: [],
				define: {},
				alias: {},
				checkFetch: false,
				targetConsumer: "deploy",
				local: true,
				projectRoot: process.cwd(),
				defineNavigatorUserAgent: true,
			}
		);

		// Build time warning is suppressed, because esbuild treeshakes the relevant code path
		expect(std.warn).toMatchInlineSnapshot(`""`);

		const fileContents = await readFile("dist/index.js", "utf8");

		// navigator.userAgent should have been defined, and so should not be present in the bundle
		expect(fileContents).not.toContain("navigator.userAgent");
	});
});
