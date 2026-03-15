import fs from "node:fs";
import os from "node:os";
import path from "node:path/posix";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, describe, it, vi } from "vitest";

vi.mock("../src/shared/builtin-modules", () => ({
	workerdBuiltinModules: new Set(),
}));

import {
	findCjsEntryInConditions,
	findCjsEntryInExports,
	findCjsExportAlternative,
} from "../src/pool/module-fallback";

describe("findCjsEntryInConditions", () => {
	describe("case 1: import condition matches", () => {
		it("returns require entry when import matches resolvedRelPath", ({
			expect,
		}) => {
			const result = findCjsEntryInConditions(
				{ import: "./esm/index.mjs", require: "./cjs/index.cjs" },
				"./esm/index.mjs"
			);
			expect(result).toBe("./cjs/index.cjs");
		});

		it("falls back to default when no require", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{ import: "./esm/index.mjs", default: "./cjs/index.cjs" },
				"./esm/index.mjs"
			);
			expect(result).toBe("./cjs/index.cjs");
		});

		it("prefers require over default", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{
					import: "./esm/index.mjs",
					require: "./cjs/index.cjs",
					default: "./default/index.js",
				},
				"./esm/index.mjs"
			);
			expect(result).toBe("./cjs/index.cjs");
		});

		it("returns undefined when require === import (same file)", ({
			expect,
		}) => {
			const result = findCjsEntryInConditions(
				{ import: "./index.js", require: "./index.js" },
				"./index.js"
			);
			expect(result).toBeUndefined();
		});

		it("returns undefined when import doesn't match", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{ import: "./esm/index.mjs", require: "./cjs/index.cjs" },
				"./other/file.mjs"
			);
			expect(result).toBeUndefined();
		});

		it("returns undefined when import is not a string (nested object)", ({
			expect,
		}) => {
			const result = findCjsEntryInConditions(
				{
					import: { node: "./esm/index.mjs" },
					require: "./cjs/index.cjs",
				},
				"./esm/index.mjs"
			);
			expect(result).toBeUndefined();
		});

		it("returns undefined when require/default are not strings", ({
			expect,
		}) => {
			const result = findCjsEntryInConditions(
				{
					import: "./esm/index.mjs",
					require: { node: "./cjs/index.cjs" },
				},
				"./esm/index.mjs"
			);
			expect(result).toBeUndefined();
		});
	});

	describe("case 2: default condition with workerd/worker", () => {
		it("returns workerd string condition", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{ default: "./index.js", workerd: "./workerd.js" },
				"./index.js"
			);
			expect(result).toBe("./workerd.js");
		});

		it("returns worker string condition", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{ default: "./index.js", worker: "./worker.js" },
				"./index.js"
			);
			expect(result).toBe("./worker.js");
		});

		it("workerd takes priority over worker", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{
					default: "./index.js",
					workerd: "./workerd.js",
					worker: "./worker.js",
				},
				"./index.js"
			);
			expect(result).toBe("./workerd.js");
		});

		it("handles workerd as object with require field", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{
					default: "./index.js",
					workerd: { require: "./workerd-cjs.js" },
				},
				"./index.js"
			);
			expect(result).toBe("./workerd-cjs.js");
		});

		it("handles workerd as object with default field", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{
					default: "./index.js",
					workerd: { default: "./workerd-default.js" },
				},
				"./index.js"
			);
			expect(result).toBe("./workerd-default.js");
		});

		it("handles workerd as object with import field", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{
					default: "./index.js",
					workerd: { import: "./workerd-esm.js" },
				},
				"./index.js"
			);
			expect(result).toBe("./workerd-esm.js");
		});

		it("object prefers require > default > import", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{
					default: "./index.js",
					workerd: {
						require: "./workerd-cjs.js",
						default: "./workerd-default.js",
						import: "./workerd-esm.js",
					},
				},
				"./index.js"
			);
			expect(result).toBe("./workerd-cjs.js");
		});

		it("skips workerd when it resolves to same path, tries worker", ({
			expect,
		}) => {
			const result = findCjsEntryInConditions(
				{
					default: "./index.js",
					workerd: "./index.js",
					worker: "./worker.js",
				},
				"./index.js"
			);
			expect(result).toBe("./worker.js");
		});

		it("returns undefined when no workerd/worker conditions", ({
			expect,
		}) => {
			const result = findCjsEntryInConditions(
				{ default: "./index.js", node: "./node.js" },
				"./index.js"
			);
			// "node" is not "workerd" or "worker", so case 2 doesn't match,
			// but it will recurse into "node" (case 3) and not find a match there
			expect(result).toBeUndefined();
		});

		it("handles null workerd gracefully", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{ default: "./index.js", workerd: null, worker: "./worker.js" },
				"./index.js"
			);
			expect(result).toBe("./worker.js");
		});
	});

	describe("case 3: recursion into nested conditions", () => {
		it("recurses into custom condition keys", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{
					node: {
						import: "./esm/index.mjs",
						require: "./cjs/index.cjs",
					},
				},
				"./esm/index.mjs"
			);
			expect(result).toBe("./cjs/index.cjs");
		});

		it("skips import/require/default keys for recursion", ({ expect }) => {
			// When import is a string (not object), it won't recurse into it
			const result = findCjsEntryInConditions(
				{
					import: "./esm/index.mjs",
					require: "./cjs/index.cjs",
				},
				"./other/file.mjs"
			);
			expect(result).toBeUndefined();
		});

		it("handles deeply nested conditions", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{
					node: {
						production: {
							import: "./esm/prod.mjs",
							require: "./cjs/prod.cjs",
						},
					},
				},
				"./esm/prod.mjs"
			);
			expect(result).toBe("./cjs/prod.cjs");
		});

		it("returns first match found", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{
					node: {
						import: "./esm/index.mjs",
						require: "./cjs/node.cjs",
					},
					browser: {
						import: "./esm/index.mjs",
						require: "./cjs/browser.cjs",
					},
				},
				"./esm/index.mjs"
			);
			// Should return the first match (node)
			expect(result).toBe("./cjs/node.cjs");
		});

		it("skips non-object/null values during recursion", ({ expect }) => {
			const result = findCjsEntryInConditions(
				{
					types: "./index.d.ts",
					node: null,
					browser: {
						import: "./esm/index.mjs",
						require: "./cjs/index.cjs",
					},
				},
				"./esm/index.mjs"
			);
			expect(result).toBe("./cjs/index.cjs");
		});

		it("returns undefined for empty conditions", ({ expect }) => {
			const result = findCjsEntryInConditions({}, "./esm/index.mjs");
			expect(result).toBeUndefined();
		});
	});
});

describe("findCjsEntryInExports", () => {
	it("finds entry in standard exports map with '.' entry", ({ expect }) => {
		const result = findCjsEntryInExports(
			{
				".": {
					import: "./esm/index.mjs",
					require: "./cjs/index.cjs",
				},
			},
			"./esm/index.mjs"
		);
		expect(result).toBe("./cjs/index.cjs");
	});

	it("finds match in second export entry", ({ expect }) => {
		const result = findCjsEntryInExports(
			{
				".": {
					import: "./esm/main.mjs",
					require: "./cjs/main.cjs",
				},
				"./utils": {
					import: "./esm/utils.mjs",
					require: "./cjs/utils.cjs",
				},
			},
			"./esm/utils.mjs"
		);
		expect(result).toBe("./cjs/utils.cjs");
	});

	it("skips string values (not objects)", ({ expect }) => {
		const result = findCjsEntryInExports(
			{
				".": "./index.js",
				"./utils": {
					import: "./esm/utils.mjs",
					require: "./cjs/utils.cjs",
				},
			},
			"./esm/utils.mjs"
		);
		expect(result).toBe("./cjs/utils.cjs");
	});

	it("skips null values", ({ expect }) => {
		const result = findCjsEntryInExports(
			{
				"./internal": null,
				".": {
					import: "./esm/index.mjs",
					require: "./cjs/index.cjs",
				},
			},
			"./esm/index.mjs"
		);
		expect(result).toBe("./cjs/index.cjs");
	});

	it("returns undefined when no match", ({ expect }) => {
		const result = findCjsEntryInExports(
			{
				".": {
					import: "./esm/index.mjs",
					require: "./cjs/index.cjs",
				},
			},
			"./other/file.mjs"
		);
		expect(result).toBeUndefined();
	});

	it("returns undefined for empty exports", ({ expect }) => {
		const result = findCjsEntryInExports({}, "./esm/index.mjs");
		expect(result).toBeUndefined();
	});
});

describe("findCjsExportAlternative", () => {
	let tmpDir: string;

	function createTmpDir(): string {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "module-fallback-test-"));
		return tmpDir;
	}

	afterEach(() => {
		if (tmpDir) {
			removeDirSync(tmpDir);
		}
	});

	it("finds CJS alternative from package.json exports", ({ expect }) => {
		const dir = createTmpDir();
		const pkgJson = {
			name: "test-pkg",
			exports: {
				".": {
					import: "./esm/index.mjs",
					require: "./cjs/index.cjs",
				},
			},
		};
		fs.writeFileSync(
			path.join(dir, "package.json"),
			JSON.stringify(pkgJson)
		);
		fs.mkdirSync(path.join(dir, "esm"), { recursive: true });
		fs.mkdirSync(path.join(dir, "cjs"), { recursive: true });
		fs.writeFileSync(path.join(dir, "esm/index.mjs"), "");
		fs.writeFileSync(path.join(dir, "cjs/index.cjs"), "");

		const result = findCjsExportAlternative(
			path.join(dir, "esm/index.mjs")
		);
		expect(result).toBe(path.join(dir, "cjs/index.cjs"));
	});

	it("strips query strings from path", ({ expect }) => {
		const dir = createTmpDir();
		const pkgJson = {
			name: "test-pkg",
			exports: {
				".": {
					import: "./esm/index.mjs",
					require: "./cjs/index.cjs",
				},
			},
		};
		fs.writeFileSync(
			path.join(dir, "package.json"),
			JSON.stringify(pkgJson)
		);
		fs.mkdirSync(path.join(dir, "esm"), { recursive: true });
		fs.mkdirSync(path.join(dir, "cjs"), { recursive: true });
		fs.writeFileSync(path.join(dir, "esm/index.mjs"), "");
		fs.writeFileSync(path.join(dir, "cjs/index.cjs"), "");

		const result = findCjsExportAlternative(
			path.join(dir, "esm/index.mjs") + "?v=abc123"
		);
		expect(result).toBe(path.join(dir, "cjs/index.cjs"));
	});

	it("returns undefined when CJS file doesn't exist on disk", ({
		expect,
	}) => {
		const dir = createTmpDir();
		const pkgJson = {
			name: "test-pkg",
			exports: {
				".": {
					import: "./esm/index.mjs",
					require: "./cjs/index.cjs",
				},
			},
		};
		fs.writeFileSync(
			path.join(dir, "package.json"),
			JSON.stringify(pkgJson)
		);
		fs.mkdirSync(path.join(dir, "esm"), { recursive: true });
		fs.writeFileSync(path.join(dir, "esm/index.mjs"), "");
		// Note: cjs/index.cjs does NOT exist

		const result = findCjsExportAlternative(
			path.join(dir, "esm/index.mjs")
		);
		expect(result).toBeUndefined();
	});

	it("returns undefined when package.json has no exports field", ({
		expect,
	}) => {
		const dir = createTmpDir();
		const pkgJson = { name: "test-pkg", main: "./index.js" };
		fs.writeFileSync(
			path.join(dir, "package.json"),
			JSON.stringify(pkgJson)
		);
		fs.mkdirSync(path.join(dir, "esm"), { recursive: true });
		fs.writeFileSync(path.join(dir, "esm/index.mjs"), "");

		const result = findCjsExportAlternative(
			path.join(dir, "esm/index.mjs")
		);
		expect(result).toBeUndefined();
	});

	it("stops walking at package.json with name field", ({ expect }) => {
		const dir = createTmpDir();
		// Inner package with name but no matching exports
		const innerDir = path.join(dir, "inner");
		fs.mkdirSync(innerDir, { recursive: true });
		fs.writeFileSync(
			path.join(innerDir, "package.json"),
			JSON.stringify({ name: "inner-pkg" })
		);

		// Outer package with matching exports (should NOT be reached)
		fs.writeFileSync(
			path.join(dir, "package.json"),
			JSON.stringify({
				name: "outer-pkg",
				exports: {
					".": {
						import: "./inner/esm/index.mjs",
						require: "./inner/cjs/index.cjs",
					},
				},
			})
		);

		fs.mkdirSync(path.join(innerDir, "esm"), { recursive: true });
		fs.writeFileSync(path.join(innerDir, "esm/index.mjs"), "");

		const result = findCjsExportAlternative(
			path.join(innerDir, "esm/index.mjs")
		);
		// Should stop at inner package.json (which has name but no exports)
		expect(result).toBeUndefined();
	});

	it("walks up directories to find package.json", ({ expect }) => {
		const dir = createTmpDir();
		const pkgJson = {
			name: "test-pkg",
			exports: {
				"./sub": {
					import: "./src/sub/index.mjs",
					require: "./lib/sub/index.cjs",
				},
			},
		};
		fs.writeFileSync(
			path.join(dir, "package.json"),
			JSON.stringify(pkgJson)
		);
		fs.mkdirSync(path.join(dir, "src/sub"), { recursive: true });
		fs.mkdirSync(path.join(dir, "lib/sub"), { recursive: true });
		fs.writeFileSync(path.join(dir, "src/sub/index.mjs"), "");
		fs.writeFileSync(path.join(dir, "lib/sub/index.cjs"), "");

		const result = findCjsExportAlternative(
			path.join(dir, "src/sub/index.mjs")
		);
		expect(result).toBe(path.join(dir, "lib/sub/index.cjs"));
	});

	it("handles missing package.json (ENOENT) gracefully", ({ expect }) => {
		const dir = createTmpDir();
		fs.mkdirSync(path.join(dir, "esm"), { recursive: true });
		fs.writeFileSync(path.join(dir, "esm/index.mjs"), "");
		// No package.json at all

		const result = findCjsExportAlternative(
			path.join(dir, "esm/index.mjs")
		);
		expect(result).toBeUndefined();
	});
});
