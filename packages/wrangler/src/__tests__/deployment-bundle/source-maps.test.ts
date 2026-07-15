import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import {
	loadSourceMaps,
	tryAttachSourcemapToModule,
} from "../../deployment-bundle/source-maps";
import type { SourceMapBundle } from "../../deployment-bundle/source-maps";
import type { CfModule } from "@cloudflare/workers-utils";

function createTempDir(): string {
	return mkdtempSync(path.join(tmpdir(), "source-maps-test-"));
}

function makeModule(
	name: string,
	filePath: string | undefined,
	content: string,
	type: CfModule["type"] = "esm"
): CfModule {
	return { name, filePath, content, type };
}

const validSourceMap = JSON.stringify({
	version: 3,
	sources: [],
	mappings: "AAAA",
});

describe("loadSourceMaps", () => {
	it("loads source maps from bundled metadata", ({ expect }) => {
		const dir = createTempDir();
		mkdirSync(path.join(dir, "src"), { recursive: true });
		writeFileSync(path.join(dir, "src/index.ts"), "const x = 1;\n");
		writeFileSync(path.join(dir, "src/index.ts.map"), validSourceMap);

		const main = makeModule(
			"src/index.ts",
			path.join(dir, "src/index.ts"),
			"const x = 1;\n"
		);
		const bundle: SourceMapBundle = {
			sourceMapPath: "src/index.ts.map",
			sourceMapMetadata: { tmpDir: dir, entryDirectory: dir },
		};

		const result = loadSourceMaps(main, [], bundle);

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("src/index.ts.map");
	});

	it("throws when bundled source map file is missing", ({ expect }) => {
		const dir = createTempDir();
		const main = makeModule(
			"index.js",
			path.join(dir, "index.js"),
			"const x = 1;\n"
		);
		const bundle: SourceMapBundle = {
			sourceMapPath: "index.js.map",
			sourceMapMetadata: { tmpDir: dir, entryDirectory: dir },
		};

		expect(() => loadSourceMaps(main, [], bundle)).toThrow();
	});

	it("scans modules for sourceMappingURL when bundle has no metadata", ({
		expect,
	}) => {
		const dir = createTempDir();
		writeFileSync(path.join(dir, "index.js.map"), validSourceMap);

		const main = makeModule(
			"index.js",
			path.join(dir, "index.js"),
			`console.log("hello");\n//# sourceMappingURL=index.js.map`
		);
		const bundle: SourceMapBundle = {};

		const result = loadSourceMaps(main, [], bundle);

		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("index.js.map");
	});

	it("handles multiple modules with source maps in scan mode", ({ expect }) => {
		const dir = createTempDir();
		writeFileSync(path.join(dir, "a.js.map"), validSourceMap);
		writeFileSync(path.join(dir, "b.js.map"), validSourceMap);

		const main = makeModule(
			"a.js",
			path.join(dir, "a.js"),
			`//# sourceMappingURL=a.js.map`
		);
		const extra = makeModule(
			"b.js",
			path.join(dir, "b.js"),
			`//# sourceMappingURL=b.js.map`
		);
		const bundle: SourceMapBundle = {};

		const result = loadSourceMaps(main, [extra], bundle);

		expect(result).toHaveLength(2);
		expect(result[0].name).toBe("a.js.map");
		expect(result[1].name).toBe("b.js.map");
	});
});

describe("tryAttachSourcemapToModule", () => {
	it("attaches source map when module has file path and sourceMappingURL", ({
		expect,
	}) => {
		const dir = createTempDir();
		writeFileSync(path.join(dir, "index.js.map"), validSourceMap);

		const module = makeModule(
			"index.js",
			path.join(dir, "index.js"),
			`console.log("hello");\n//# sourceMappingURL=index.js.map`
		);

		tryAttachSourcemapToModule(module);

		expect(module.sourceMap).toBeDefined();
		expect(module.sourceMap?.name).toBe("index.js.map");
	});

	it("does nothing for non-js module types", ({ expect }) => {
		const module = makeModule(
			"data.wasm",
			"/tmp/data.wasm",
			"fake wasm content",
			"compiled-wasm"
		);

		tryAttachSourcemapToModule(module);

		expect(module.sourceMap).toBeUndefined();
	});

	it("does nothing for virtual modules without filePath", ({ expect }) => {
		const module = makeModule("virtual.js", undefined, `console.log("hello");`);

		tryAttachSourcemapToModule(module);

		expect(module.sourceMap).toBeUndefined();
	});

	it("does nothing when module has no sourceMappingURL comment", ({
		expect,
	}) => {
		const module = makeModule(
			"index.js",
			"/tmp/index.js",
			`console.log("hello");`
		);

		tryAttachSourcemapToModule(module);

		expect(module.sourceMap).toBeUndefined();
	});

	it("throws when sourceMappingURL points to missing file", ({ expect }) => {
		const module = makeModule(
			"index.js",
			"/tmp/index.js",
			`console.log("hello");\n//# sourceMappingURL=missing.js.map`
		);

		expect(() => tryAttachSourcemapToModule(module)).toThrow(
			"Invalid source map path"
		);
	});
});
