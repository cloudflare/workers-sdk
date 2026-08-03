import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import dedent from "ts-dedent";
import { describe, it } from "vitest";
import { findAdditionalModules } from "../deployment-bundle/find-additional-modules";
import { mockConsoleMethods } from "./helpers/mock-console";
import type { ConfigModuleRuleType } from "@cloudflare/workers-utils";

/*
 * This file contains inline comments with the word "javascript"
 * This signals to a compatible editor extension that the template string
 * contents should be syntax-highlighted as JavaScript. One such extension
 * is zjcompt.es6-string-javascript, but there are others.
 */

describe("traverse module graph", () => {
	runInTempDir();
	mockConsoleMethods();

	it("should not detect JS without module rules", async ({ expect }) => {
		await writeFile(
			"./index.js",
			dedent /* javascript */ `
			import { HELLO } from "./other.js"
			export default {
				async fetch(request) {
					return new Response(HELLO)
				}
			}
			`
		);
		await writeFile(
			"./other.js",
			dedent /* javascript */ `
			export const HELLO = "WORLD"
			`
		);

		const modules = await findAdditionalModules(
			{
				file: path.join(process.cwd(), "./index.js"),
				projectRoot: process.cwd(),
				configPath: undefined,
				format: "modules",
				moduleRoot: process.cwd(),
				exports: [],
			},
			[]
		);

		expect(modules).toStrictEqual([]);
	});

	it.for([
		["ESModule", "esm"],
		["CommonJS", "commonjs"],
	])("should detect JS as %s", async ([type, format], { expect }) => {
		await writeFile(
			"./index.js",
			dedent /* javascript */ `
			import { HELLO } from "./other.js"
			export default {
				async fetch(request) {
					return new Response(HELLO)
				}
			}
			`
		);
		await writeFile(
			"./other.js",
			dedent /* javascript */ `
			export const HELLO = "WORLD"
			`
		);

		const modules = await findAdditionalModules(
			{
				file: path.join(process.cwd(), "./index.js"),
				projectRoot: process.cwd(),
				configPath: undefined,
				format: "modules",
				moduleRoot: process.cwd(),
				exports: [],
			},
			[{ type: type as ConfigModuleRuleType, globs: ["**/*.js"] }]
		);

		expect(modules[0].type).toStrictEqual(format);
	});

	it("should not resolve JS outside the module root", async ({ expect }) => {
		await mkdir("./src/nested", { recursive: true });
		await writeFile(
			"./src/nested/index.js",
			dedent /* javascript */ `
			import { HELLO } from "../other.js"
			export default {
				async fetch(request) {
					return new Response(HELLO)
				}
			}
			`
		);
		await writeFile(
			"./src/other.js",
			dedent /* javascript */ `
			export const HELLO = "WORLD"
			`
		);

		const modules = await findAdditionalModules(
			{
				file: path.join(process.cwd(), "./src/nested/index.js"),
				projectRoot: path.join(process.cwd(), "./src/nested"),
				configPath: undefined,
				format: "modules",
				// The default module root is dirname(file)
				moduleRoot: path.join(process.cwd(), "./src/nested"),
				exports: [],
			},
			[{ type: "ESModule", globs: ["**/*.js"] }]
		);

		expect(modules).toStrictEqual([]);
	});

	it("should resolve JS with module root", async ({ expect }) => {
		await mkdir("./src/nested", { recursive: true });
		await writeFile(
			"./src/nested/index.js",
			dedent /* javascript */ `
			import { HELLO } from "../other.js"
			export default {
				async fetch(request) {
					return new Response(HELLO)
				}
			}
			`
		);
		await writeFile(
			"./src/other.js",
			dedent /* javascript */ `
			export const HELLO = "WORLD"
			`
		);

		const modules = await findAdditionalModules(
			{
				file: path.join(process.cwd(), "./src/nested/index.js"),
				projectRoot: path.join(process.cwd(), "./src/nested"),
				configPath: undefined,
				format: "modules",
				// The default module root is dirname(file)
				moduleRoot: path.join(process.cwd(), "./src"),
				exports: [],
			},
			[{ type: "ESModule", globs: ["**/*.js"] }]
		);

		expect(modules[0].name).toStrictEqual("other.js");
	});

	it("should ignore files not matched by glob", async ({ expect }) => {
		await mkdir("./src/nested", { recursive: true });
		await writeFile(
			"./src/nested/index.js",
			dedent /* javascript */ `
			import { HELLO } from "../other.js"
			export default {
				async fetch(request) {
					return new Response(HELLO)
				}
			}
			`
		);
		await writeFile(
			"./src/other.js",
			dedent /* javascript */ `
			export const HELLO = "WORLD"
			`
		);

		const modules = await findAdditionalModules(
			{
				file: path.join(process.cwd(), "./src/nested/index.js"),
				projectRoot: path.join(process.cwd(), "./src/nested"),
				configPath: undefined,
				format: "modules",
				// The default module root is dirname(file)
				moduleRoot: path.join(process.cwd(), "./src"),
				exports: [],
			},
			[{ type: "ESModule", globs: ["**/*.mjs"] }]
		);

		expect(modules.length).toStrictEqual(0);
	});

	it("should ignore Wrangler files", async ({ expect }) => {
		await mkdir("./src", { recursive: true });
		await writeFile(
			"./src/index.js",
			dedent /* javascript */ `
			import { HELLO } from "./other.js"
			export default {
				async fetch(request) {
					return new Response(HELLO)
				}
			}
			`
		);
		await writeFile(
			"./src/wrangler.jsonc",
			dedent /* jsonc */ `
			{
				"compatibility_date": "2025/01/01"
			}
			`
		);

		await mkdir("./src/.wrangler/tmp", { recursive: true });
		await writeFile(
			"./src/.wrangler/tmp/temp-file.js",
			dedent`
			export const DO_NOT_BUNDLE = 10;
			`
		);

		const modules = await findAdditionalModules(
			{
				file: path.join(process.cwd(), "./src/index.js"),
				projectRoot: path.join(process.cwd(), "./src"),
				configPath: path.join(process.cwd(), "./src/wrangler.jsonc"),
				format: "modules",
				// The default module root is dirname(file)
				moduleRoot: path.join(process.cwd(), "./src"),
				exports: [],
			},
			[
				{ type: "ESModule", globs: ["**/*.js"] },
				{ type: "Text", globs: ["**/*.jsonc"] },
			]
		);

		expect(modules.map((m) => m.name)).toMatchInlineSnapshot(`[]`);
	});

	it("should resolve files that match the default rules", async ({
		expect,
	}) => {
		await mkdir("./src", { recursive: true });
		await writeFile(
			"./src/index.js",
			dedent /* javascript */ `
			import HELLO from "../other.txt"
			export default {
				async fetch(request) {
					return new Response(HELLO)
				}
			}
			`
		);
		await writeFile(
			"./src/other.txt",
			dedent /* javascript */ `
			export const HELLO = "WORLD"
			`
		);

		const modules = await findAdditionalModules(
			{
				file: path.join(process.cwd(), "./src/index.js"),
				projectRoot: path.join(process.cwd(), "./src"),
				configPath: undefined,
				format: "modules",
				// The default module root is dirname(file)
				moduleRoot: path.join(process.cwd(), "./src"),
				exports: [],
			},
			[]
		);

		expect(modules[0].name).toStrictEqual("other.txt");
	});

	it("should not error when a discovered file matches a rule that was shadowed by a previous rule of the same type", async ({
		expect,
	}) => {
		await mkdir("./src", { recursive: true });
		await writeFile(
			"./src/index.js",
			dedent /* javascript */ `
			export default {
				async fetch(request) {
					return new Response(HELLO)
				}
			}
			`
		);
		await writeFile(
			"./src/other.txt",
			dedent /* javascript */ `
			export const HELLO = "WORLD"
			`
		);

		// Two Text rules of the same type — the second is "shadowed" by the first
		// (which has the default `fallthrough` behavior). The discovered file
		// `other.txt` matches both rules' globs, but should be silently included
		// under the first (live) rule rather than throwing.
		const modules = await findAdditionalModules(
			{
				file: path.join(process.cwd(), "./src/index.js"),
				projectRoot: path.join(process.cwd(), "./src"),
				configPath: undefined,
				format: "modules",
				// The default module root is dirname(file)
				moduleRoot: path.join(process.cwd(), "./src"),
				exports: [],
			},
			[
				{ type: "Text", globs: ["**/*.txt"] },
				{ type: "Text", globs: ["other.txt"] },
			]
		);

		expect(modules.map((m) => m.name)).toStrictEqual(["other.txt"]);
	});

	it("should silently skip a discovered file that only matches a shadowed rule (issue #14257)", async ({
		expect,
	}) => {
		// Mirrors the reproduction from
		// https://github.com/cloudflare/workers-sdk/issues/14257
		// The user has a custom Text rule with `fallthrough: false`, which shadows
		// the default Text rule (`**/*.txt`, `**/*.html`, `**/*.sql`). A file on
		// disk that only matches the shadowed default rule should be silently
		// excluded from the bundle, not error out the build.
		await mkdir("./src/html", { recursive: true });
		await writeFile(
			"./src/index.js",
			dedent /* javascript */ `
			import text from './html/includeme.html'
			export default {
				async fetch(request) {
					return new Response(text, {headers: {'Content-Type': 'text/html'}})
				},
			}
			`
		);
		await writeFile("./src/html/includeme.html", "<p>include me</p>");
		await writeFile("./src/html/dontincludeme.html", "<p>don't include me</p>");

		const modules = await findAdditionalModules(
			{
				file: path.join(process.cwd(), "./src/index.js"),
				projectRoot: path.join(process.cwd(), "./src"),
				configPath: undefined,
				format: "modules",
				moduleRoot: path.join(process.cwd(), "./src"),
				exports: [],
			},
			[
				{
					type: "Text",
					globs: ["html/includeme.html"],
					fallthrough: false,
				},
			]
		);

		expect(modules.map((m) => m.name)).toStrictEqual(["html/includeme.html"]);
	});
});

describe("Python modules", () => {
	runInTempDir();
	mockConsoleMethods();

	it("should find python_modules with forward slashes (for cross-platform deploy)", async ({
		expect,
	}) => {
		await mkdir("./python_modules/pkg/subpkg", { recursive: true });
		await writeFile("./index.py", "def fetch(request): pass");
		await writeFile("./python_modules/pkg/__init__.py", "");
		await writeFile("./python_modules/pkg/subpkg/mod.py", "x = 1");

		const modules = await findAdditionalModules(
			{
				file: path.join(process.cwd(), "./index.py"),
				projectRoot: process.cwd(),
				configPath: undefined,
				format: "modules",
				moduleRoot: process.cwd(),
				exports: [],
			},
			[]
		);

		const pythonModules = modules.filter((m) =>
			m.name.startsWith("python_modules/")
		);
		expect(pythonModules.map((m) => m.name)).toEqual(
			expect.arrayContaining([
				"python_modules/pkg/__init__.py",
				"python_modules/pkg/subpkg/mod.py",
			])
		);
		// This assertion catches Windows path.join() regression
		pythonModules.forEach((m) => {
			expect(m.name).not.toContain("\\");
		});
	});

	it("should exclude files matching pythonModulesExcludes patterns", async ({
		expect,
	}) => {
		await mkdir("./python_modules", { recursive: true });
		await writeFile("./index.py", "def fetch(request): pass");
		await writeFile("./python_modules/module.py", "x = 1");
		await writeFile("./python_modules/module.pyc", "compiled");
		await writeFile("./python_modules/test_module.py", "def test(): pass");

		const modules = await findAdditionalModules(
			{
				file: path.join(process.cwd(), "./index.py"),
				projectRoot: process.cwd(),
				configPath: undefined,
				format: "modules",
				moduleRoot: process.cwd(),
				exports: [],
			},
			[],
			false,
			["**/*.pyc", "**/test_*.py"]
		);

		const moduleNames = modules.map((m) => m.name);
		expect(moduleNames).toContain("python_modules/module.py");
		expect(moduleNames).not.toContain("python_modules/module.pyc");
		expect(moduleNames).not.toContain("python_modules/test_module.py");
	});

	it("should register .mjs and .js files in workers/ as esm type", async ({
		expect,
	}) => {
		await mkdir("./python_modules/workers", { recursive: true });
		await mkdir("./python_modules/otherpkg", { recursive: true });
		await writeFile("./index.py", "def fetch(request): pass");
		await writeFile(
			"./python_modules/workers/sdk.mjs",
			"export function patchWaitUntil(ctx) {}"
		);
		await writeFile(
			"./python_modules/workers/helper.js",
			"export function helper() {}"
		);
		await writeFile("./python_modules/workers/__init__.py", "");
		await writeFile("./python_modules/otherpkg/util.mjs", "export const x = 1");

		const modules = await findAdditionalModules(
			{
				file: path.join(process.cwd(), "./index.py"),
				projectRoot: process.cwd(),
				configPath: undefined,
				format: "modules",
				moduleRoot: process.cwd(),
				exports: [],
			},
			[]
		);

		const vendored = modules.filter((m) =>
			m.name.startsWith("python_modules/")
		);

		const findModule = (name: string) => vendored.find((m) => m.name === name);

		const sdkModule = findModule("python_modules/workers/sdk.mjs");
		const helperModule = findModule("python_modules/workers/helper.js");
		const initModule = findModule("python_modules/workers/__init__.py");
		const utilModule = findModule("python_modules/otherpkg/util.mjs");

		expect(sdkModule).toBeDefined();
		expect(sdkModule?.type).toBe("esm");
		expect(helperModule).toBeDefined();
		expect(helperModule?.type).toBe("esm");
		expect(initModule).toBeDefined();
		expect(initModule?.type).toBe("buffer");
		expect(utilModule).toBeDefined();
		expect(utilModule?.type).toBe("buffer");
	});
});
