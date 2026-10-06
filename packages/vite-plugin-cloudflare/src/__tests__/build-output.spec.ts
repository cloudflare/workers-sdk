import { afterEach, describe, it, vi } from "vitest";
import { isPreviewBuild, PREVIEW_BUILD_ENV_VAR } from "../build-output-env";
import { detectModuleType } from "../plugins/build-output";

describe("isPreviewBuild", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("uses the shared Preview build environment variable", ({ expect }) => {
		expect(PREVIEW_BUILD_ENV_VAR).toBe("CLOUDFLARE_PREVIEW_BUILD");
		vi.stubEnv(PREVIEW_BUILD_ENV_VAR, "true");

		expect(isPreviewBuild()).toBe(true);
	});

	it("is false for non-Preview builds", ({ expect }) => {
		vi.stubEnv(PREVIEW_BUILD_ENV_VAR, "false");

		expect(isPreviewBuild()).toBe(false);
	});
});

describe("detectModuleType", () => {
	const cases: Array<{ filename: string; expected: string }> = [
		{ filename: "entry.js", expected: "esm" },
		{ filename: "entry.mjs", expected: "esm" },
		{ filename: "lib.wasm", expected: "wasm" },
		{ filename: "raw.bin", expected: "data" },
		{ filename: "greeting.txt", expected: "text" },
		{ filename: "page.html", expected: "text" },
		{ filename: "query.sql", expected: "text" },
		{ filename: "data.json", expected: "json" },
		{ filename: "bundle.js.map", expected: "sourcemap" },
		{ filename: "unknown.xyz", expected: "data" },
		// Case-insensitive on extension
		{ filename: "ENTRY.JS", expected: "esm" },
		{ filename: "LIB.WASM", expected: "wasm" },
		// No extension → default `data`
		{ filename: "LICENSE", expected: "data" },
		// Nested paths — only the extension matters
		{ filename: "chunks/foo.js", expected: "esm" },
		{ filename: "chunks/foo.wasm", expected: "wasm" },
	];

	it.for(cases)(
		"maps $filename → $expected",
		({ filename, expected }, { expect }) => {
			expect(detectModuleType(filename)).toBe(expected);
		}
	);
});
