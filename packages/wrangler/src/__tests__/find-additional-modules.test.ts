import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import dedent from "ts-dedent";
/* eslint-disable workers-sdk/no-vitest-import-expect -- uses .each */
import { describe, expect, it } from "vitest";
/* eslint-enable workers-sdk/no-vitest-import-expect */
import { findAdditionalModules } from "../deployment-bundle/find-additional-modules";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
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

	it("should not detect JS without module rules", async () => {
		await writeFile(
			"./index.js",
			dedent/* javascript */ `
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
			dedent/* javascript */ `
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

	it.each([
		["ESModule", "esm"],
		["CommonJS", "commonjs"],
	])("should detect JS as %s", async (type, format) => {
		await writeFile(
			"./index.js",
			dedent/* javascript */ `
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
			dedent/* javascript */ `
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

	it("should not resolve JS outside the module root", async () => {
		await mkdir("./src/nested", { recursive: true });
		await writeFile(
			"./src/nested/index.js",
			dedent/* javascript */ `
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
			dedent/* javascript */ `
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

	it("should resolve JS with module root", async () => {
		await mkdir("./src/nested", { recursive: true });
		await writeFile(
			"./src/nested/index.js",
			dedent/* javascript */ `
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
			dedent/* javascript */ `
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

	it("should ignore files not matched by glob", async () => {
		await mkdir("./src/nested", { recursive: true });
		await writeFile(
			"./src/nested/index.js",
			dedent/* javascript */ `
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
			dedent/* javascript */ `
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

	it("should ignore Wrangler files", async () => {
		await mkdir("./src", { recursive: true });
		await writeFile(
			"./src/index.js",
			dedent/* javascript */ `
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
			dedent/* jsonc */ `
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

	it("should resolve files that match the default rules", async () => {
		await mkdir("./src", { recursive: true });
		await writeFile(
			"./src/index.js",
			dedent/* javascript */ `
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
			dedent/* javascript */ `
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

	it("should error if a rule is ignored because the previous was not marked 'fall-through'", async () => {
		await mkdir("./src", { recursive: true });
		await writeFile(
			"./src/index.js",
			dedent/* javascript */ `
			export default {
				async fetch(request) {
					return new Response(HELLO)
				}
			}
			`
		);
		await writeFile(
			"./src/other.txt",
			dedent/* javascript */ `
			export const HELLO = "WORLD"
			`
		);

		await expect(
			findAdditionalModules(
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
			)
		).rejects.toMatchInlineSnapshot(
			`[Error: The file other.txt matched a module rule in your configuration ({"type":"Text","globs":["other.txt"]}), but was ignored because a previous rule with the same type was not marked as \`fallthrough = true\`.]`
		);
	});
});

describe("Python modules", () => {
	runInTempDir();
	mockConsoleMethods();

	it("should find python_modules with forward slashes (for cross-platform deploy)", async () => {
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

	it("should exclude files matching pythonModulesExcludes patterns", async () => {
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
});
