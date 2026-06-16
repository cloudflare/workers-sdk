import { describe, it } from "vitest";
import { detectModuleType } from "../plugins/build-output";

describe("detectModuleType", () => {
	const cases: Array<[filename: string, expected: string]> = [
		["entry.js", "esm"],
		["entry.mjs", "esm"],
		["lib.wasm", "wasm"],
		["raw.bin", "data"],
		["greeting.txt", "text"],
		["page.html", "text"],
		["query.sql", "text"],
		["data.json", "json"],
		["bundle.js.map", "sourcemap"],
		["unknown.xyz", "data"],
		// Case-insensitive on extension
		["ENTRY.JS", "esm"],
		["LIB.WASM", "wasm"],
		// No extension → default `data`
		["LICENSE", "data"],
		// Nested paths — only the extension matters
		["chunks/foo.js", "esm"],
		["chunks/foo.wasm", "wasm"],
	];

	for (const [filename, expected] of cases) {
		it(`maps ${filename} → ${expected}`, ({ expect }) => {
			expect(detectModuleType(filename)).toBe(expected);
		});
	}
});
