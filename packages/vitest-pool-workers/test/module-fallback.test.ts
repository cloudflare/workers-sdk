import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { removeDir } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
	findCjsAlternative,
	findCjsEntryInConditions,
	findCjsEntryInExports,
} from "../src/pool/module-fallback";

// ---------------------------------------------------------------------------
// Pure unit tests for findCjsEntryInConditions / findCjsEntryInExports
// ---------------------------------------------------------------------------

describe("findCjsEntryInConditions", () => {
	it("returns require entry when import condition matches", ({ expect }) => {
		const result = findCjsEntryInConditions(
			{
				import: "./esm/index.js",
				require: "./dist/index.js",
				default: "./dist/index.js",
			},
			"./esm/index.js"
		);
		expect(result).toBe("./dist/index.js");
	});

	it("returns default entry when require is absent but default differs", ({
		expect,
	}) => {
		const result = findCjsEntryInConditions(
			{
				import: "./esm/index.mjs",
				default: "./lib/index.js",
			},
			"./esm/index.mjs"
		);
		expect(result).toBe("./lib/index.js");
	});

	it("returns undefined when import entry does not match resolved path", ({
		expect,
	}) => {
		const result = findCjsEntryInConditions(
			{
				import: "./esm/index.js",
				require: "./dist/index.js",
			},
			"./other/file.js"
		);
		expect(result).toBeUndefined();
	});

	it("returns undefined when import and require point to the same file", ({
		expect,
	}) => {
		const result = findCjsEntryInConditions(
			{
				import: "./dist/index.js",
				require: "./dist/index.js",
			},
			"./dist/index.js"
		);
		expect(result).toBeUndefined();
	});

	it("recurses into nested condition objects", ({ expect }) => {
		const result = findCjsEntryInConditions(
			{
				node: {
					import: "./esm/node.js",
					require: "./cjs/node.js",
				},
			},
			"./esm/node.js"
		);
		expect(result).toBe("./cjs/node.js");
	});

	it("does not recurse into import/require/default string entries", ({
		expect,
	}) => {
		// Strings under "import"/"require"/"default" are terminal, not nested maps
		const result = findCjsEntryInConditions(
			{
				import: "./esm/index.js",
				require: "./cjs/index.js",
			},
			"./cjs/index.js"
		);
		// require entry IS NOT the esm path, so no match from import condition
		expect(result).toBeUndefined();
	});
});

describe("findCjsEntryInExports", () => {
	it("finds cjs entry from a standard dual-format exports map", ({
		expect,
	}) => {
		const result = findCjsEntryInExports(
			{
				".": {
					import: "./esm/index.mjs",
					require: "./lib/index.js",
					default: "./lib/index.js",
				},
			},
			"./esm/index.mjs"
		);
		expect(result).toBe("./lib/index.js");
	});

	it("returns undefined when no matching entry exists", ({ expect }) => {
		const result = findCjsEntryInExports(
			{
				".": {
					import: "./esm/index.js",
					require: "./dist/index.js",
				},
			},
			"./totally/different/path.js"
		);
		expect(result).toBeUndefined();
	});

	it("searches across multiple export subpaths", ({ expect }) => {
		const result = findCjsEntryInExports(
			{
				".": {
					import: "./esm/index.js",
					require: "./dist/index.js",
				},
				"./sub": {
					import: "./esm/sub.js",
					require: "./dist/sub.js",
				},
			},
			"./esm/sub.js"
		);
		expect(result).toBe("./dist/sub.js");
	});
});

// ---------------------------------------------------------------------------
// Integration tests for findCjsAlternative (needs real filesystem fixtures)
// ---------------------------------------------------------------------------

describe("findCjsAlternative", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mf-test-"));
	});

	afterEach(async () => {
		await removeDir(tmpDir);
	});

	/**
	 * Creates files under tmpDir.  `files` is a map of relative path → content.
	 */
	function scaffold(files: Record<string, string>) {
		for (const [relPath, content] of Object.entries(files)) {
			const abs = path.join(tmpDir, relPath);
			fs.mkdirSync(path.dirname(abs), { recursive: true });
			fs.writeFileSync(abs, content);
		}
	}

	/**
	 * Returns a POSIX-style absolute path inside tmpDir.
	 */
	function p(...parts: string[]): string {
		// On Windows posixPath.join would use forward slashes; on POSIX it's the same
		return path.posix.join(tmpDir.replaceAll("\\", "/"), ...parts);
	}

	it("returns CJS alternative for .mjs file with require condition", ({
		expect,
	}) => {
		scaffold({
			"package.json": JSON.stringify({
				name: "my-pkg",
				exports: {
					".": {
						import: "./esm/index.mjs",
						require: "./lib/index.js",
					},
				},
			}),
			"esm/index.mjs": "export default 42;",
			"lib/index.js": "module.exports = 42;",
		});

		const result = findCjsAlternative(p("esm/index.mjs"));
		expect(result).toBe(p("lib/index.js"));
	});

	it("returns CJS alternative for .js file in type:module package", ({
		expect,
	}) => {
		scaffold({
			"package.json": JSON.stringify({
				name: "my-pkg",
				type: "module",
				exports: {
					".": {
						import: "./esm/index.js",
						require: "./dist/index.cjs",
					},
				},
			}),
			"esm/index.js": "export default 42;",
			"dist/index.cjs": "module.exports = 42;",
		});

		const result = findCjsAlternative(p("esm/index.js"));
		expect(result).toBe(p("dist/index.cjs"));
	});

	it("returns undefined for a plain CJS .js file (not in type:module pkg)", ({
		expect,
	}) => {
		scaffold({
			"package.json": JSON.stringify({ name: "my-pkg" }),
			"lib/index.js": "module.exports = 42;",
		});

		const result = findCjsAlternative(p("lib/index.js"));
		expect(result).toBeUndefined();
	});

	it("returns undefined when package has no exports map", ({ expect }) => {
		scaffold({
			"package.json": JSON.stringify({
				name: "my-pkg",
				type: "module",
				main: "./index.js",
			}),
			"index.js": "export default 42;",
		});

		const result = findCjsAlternative(p("index.js"));
		expect(result).toBeUndefined();
	});

	it("returns undefined when the CJS candidate file does not exist on disk", ({
		expect,
	}) => {
		scaffold({
			"package.json": JSON.stringify({
				name: "my-pkg",
				exports: {
					".": {
						import: "./esm/index.mjs",
						require: "./lib/index.js",
						// lib/index.js is NOT created
					},
				},
			}),
			"esm/index.mjs": "export default 42;",
		});

		const result = findCjsAlternative(p("esm/index.mjs"));
		expect(result).toBeUndefined();
	});

	it("works for pg-protocol-style layout", ({ expect }) => {
		scaffold({
			"package.json": JSON.stringify({
				name: "pg-protocol",
				exports: {
					".": {
						import: "./esm/index.js",
						require: "./dist/index.js",
						default: "./dist/index.js",
					},
					"./dist/*": "./dist/*.js",
					"./dist/*.js": "./dist/*.js",
				},
			}),
			"esm/index.js":
				"import * as p from '../dist/index.js'; export default p;",
			"dist/index.js": '"use strict"; module.exports = {};',
		});

		const result = findCjsAlternative(p("esm/index.js"));
		expect(result).toBe(p("dist/index.js"));
	});

	it("works for pg-connection-string .mjs layout", ({ expect }) => {
		scaffold({
			"package.json": JSON.stringify({
				name: "pg-connection-string",
				exports: {
					".": {
						import: "./esm/index.mjs",
						require: "./index.js",
						default: "./index.js",
					},
				},
			}),
			"esm/index.mjs": "export default {};",
			"index.js": "module.exports = {};",
		});

		const result = findCjsAlternative(p("esm/index.mjs"));
		expect(result).toBe(p("index.js"));
	});

	it("strips query suffix before checking ESM nature", ({ expect }) => {
		scaffold({
			"package.json": JSON.stringify({
				name: "my-pkg",
				exports: {
					".": {
						import: "./esm/index.mjs",
						require: "./lib/index.js",
					},
				},
			}),
			"esm/index.mjs": "export default 42;",
			"lib/index.js": "module.exports = 42;",
		});

		// The module-fallback passes paths with ?mf_vitest_no_cjs_esm_shim suffix
		const result = findCjsAlternative(
			p("esm/index.mjs") + "?mf_vitest_no_cjs_esm_shim"
		);
		expect(result).toBe(p("lib/index.js"));
	});

	it("returns undefined for non-ESM .cjs file", ({ expect }) => {
		scaffold({
			"package.json": JSON.stringify({ name: "my-pkg" }),
			"lib/index.cjs": "module.exports = 42;",
		});

		const result = findCjsAlternative(p("lib/index.cjs"));
		expect(result).toBeUndefined();
	});
});
