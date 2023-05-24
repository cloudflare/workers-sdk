import { mkdir, writeFile } from "fs/promises";
import path from "path";
import dedent from "ts-dedent";
import traverseModuleGraph from "../traverse-module-graph";
import { runInTempDir } from "./helpers/run-in-tmp";
import type { ConfigModuleRuleType } from "../config";

/*
 * This file contains inline comments with the word "javascript"
 * This signals to a compatible editor extension that the template string
 * contents should be syntax-highlighted as JavaScript. One such extension
 * is zjcompt.es6-string-javascript, but there are others.
 */

describe("traverse module graph", () => {
	runInTempDir();

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

		const bundle = await traverseModuleGraph(
			{
				file: path.join(process.cwd(), "./index.js"),
				directory: process.cwd(),
				format: "modules",
				moduleRoot: process.cwd(),
			},
			[]
		);

		expect(bundle.modules).toStrictEqual([]);
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

		const bundle = await traverseModuleGraph(
			{
				file: path.join(process.cwd(), "./index.js"),
				directory: process.cwd(),
				format: "modules",
				moduleRoot: process.cwd(),
			},
			[{ type: type as ConfigModuleRuleType, globs: ["**/*.js"] }]
		);

		expect(bundle.modules[0].type).toStrictEqual(format);
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

		const bundle = await traverseModuleGraph(
			{
				file: path.join(process.cwd(), "./src/nested/index.js"),
				directory: path.join(process.cwd(), "./src/nested"),
				format: "modules",
				// The default module root is dirname(file)
				moduleRoot: path.join(process.cwd(), "./src/nested"),
			},
			[{ type: "ESModule", globs: ["**/*.js"] }]
		);

		expect(bundle.modules).toStrictEqual([]);
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

		const bundle = await traverseModuleGraph(
			{
				file: path.join(process.cwd(), "./src/nested/index.js"),
				directory: path.join(process.cwd(), "./src/nested"),
				format: "modules",
				// The default module root is dirname(file)
				moduleRoot: path.join(process.cwd(), "./src"),
			},
			[{ type: "ESModule", globs: ["**/*.js"] }]
		);

		expect(bundle.modules[0].name).toStrictEqual("other.js");
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

		const bundle = await traverseModuleGraph(
			{
				file: path.join(process.cwd(), "./src/nested/index.js"),
				directory: path.join(process.cwd(), "./src/nested"),
				format: "modules",
				// The default module root is dirname(file)
				moduleRoot: path.join(process.cwd(), "./src"),
			},
			[{ type: "ESModule", globs: ["**/*.mjs"] }]
		);

		expect(bundle.modules.length).toStrictEqual(0);
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

		const bundle = await traverseModuleGraph(
			{
				file: path.join(process.cwd(), "./src/index.js"),
				directory: path.join(process.cwd(), "./src"),
				format: "modules",
				// The default module root is dirname(file)
				moduleRoot: path.join(process.cwd(), "./src"),
			},
			[]
		);

		expect(bundle.modules[0].name).toStrictEqual("other.txt");
	});
});
