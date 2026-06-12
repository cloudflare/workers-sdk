import { describe, test } from "vitest";
import { getModulesFromManifest } from "../miniflare-options";

describe("getModulesFromManifest", () => {
	test("hoists `mainModule` to index 0 even when it is not first in the manifest", ({
		expect,
	}) => {
		const result = getModulesFromManifest({
			rootPath: "/tmp/bundle",
			mainModule: "index.js",
			modules: {
				"assets/data.bin": { type: "data" },
				"index.js": { type: "esm" },
				"assets/text.txt": { type: "text" },
			},
		});

		expect(result.modules[0]).toEqual({ type: "ESModule", path: "index.js" });
		expect(result.modules.map((m) => m.path)).toEqual([
			"index.js",
			"assets/data.bin",
			"assets/text.txt",
		]);
	});

	test("preserves the order of non-entry modules", ({ expect }) => {
		const result = getModulesFromManifest({
			rootPath: "/tmp/bundle",
			mainModule: "index.js",
			modules: {
				"index.js": { type: "esm" },
				"a.bin": { type: "data" },
				"b.txt": { type: "text" },
				"c.wasm": { type: "wasm" },
			},
		});

		expect(result.modules.map((m) => m.path)).toEqual([
			"index.js",
			"a.bin",
			"b.txt",
			"c.wasm",
		]);
	});

	test("translates Build Output API module types to Miniflare types", ({
		expect,
	}) => {
		const result = getModulesFromManifest({
			rootPath: "/tmp/bundle",
			mainModule: "index.js",
			modules: {
				"index.js": { type: "esm" },
				"data.bin": { type: "data" },
				"text.txt": { type: "text" },
				"compiled.wasm": { type: "wasm" },
			},
		});

		expect(result.modules).toEqual([
			{ type: "ESModule", path: "index.js" },
			{ type: "Data", path: "data.bin" },
			{ type: "Text", path: "text.txt" },
			{ type: "CompiledWasm", path: "compiled.wasm" },
		]);
	});

	test("excludes sourcemap modules from the runtime module list", ({
		expect,
	}) => {
		const result = getModulesFromManifest({
			rootPath: "/tmp/bundle",
			mainModule: "index.js",
			modules: {
				"index.js": { type: "esm" },
				"index.js.map": { type: "sourcemap" },
			},
		});

		expect(result.modules).toEqual([{ type: "ESModule", path: "index.js" }]);
	});

	test("passes `rootPath` through unchanged", ({ expect }) => {
		const result = getModulesFromManifest({
			rootPath: "/abs/path/to/bundle",
			mainModule: "index.js",
			modules: { "index.js": { type: "esm" } },
		});

		expect(result.rootPath).toBe("/abs/path/to/bundle");
	});

	test("throws when `mainModule` is missing from `modules`", ({ expect }) => {
		expect(() =>
			getModulesFromManifest({
				rootPath: "/tmp/bundle",
				mainModule: "missing.js",
				modules: { "index.js": { type: "esm" } },
			})
		).toThrow(/`mainModule` "missing\.js" is missing from `modules`/);
	});
});
