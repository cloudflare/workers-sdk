import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "vitest";
import { readWasmSourceMap } from "../wasm-source-map";

/** Builds a WebAssembly module whose only section is `sourceMappingURL`. */
function wasmModule(sourceMappingUrl?: string): Uint8Array {
	const name = (text: string) => {
		const bytes = new TextEncoder().encode(text);
		return [bytes.length, ...bytes];
	};
	const payload =
		sourceMappingUrl === undefined
			? [...name("producers"), 0]
			: [...name("sourceMappingURL"), ...name(sourceMappingUrl)];
	return new Uint8Array([
		...[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00],
		0,
		payload.length,
		...payload,
	]);
}

describe("readWasmSourceMap", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wasm-source-map-"));
	const modulePath = path.join(dir, "index_bg.wasm");
	fs.writeFileSync(
		path.join(dir, "index_bg.wasm.map"),
		JSON.stringify({ version: 3, file: "index_bg.wasm", mappings: "" })
	);
	fs.writeFileSync(path.join(dir, "invalid.wasm.map"), "not json");

	it("reads the map and names it next to the emitted module", async ({
		expect,
	}) => {
		expect(
			await readWasmSourceMap(
				modulePath,
				wasmModule("index_bg.wasm.map"),
				"assets/index_bg-a1b2c3.wasm"
			)
		).toEqual({
			fileName: "assets/index_bg.wasm.map",
			sourceMap: { version: 3, file: "index_bg.wasm", mappings: "" },
		});
	});

	it.for([
		["no sourceMappingURL section", undefined],
		["an absolute URL", "https://example.com/index_bg.wasm.map"],
	])("returns undefined for %s", async ([, url], { expect }) => {
		expect(
			await readWasmSourceMap(modulePath, wasmModule(url), "index_bg.wasm")
		).toBeUndefined();
	});

	it.for([
		["a data URL", "data:application/json;base64,e30=", "data URL"],
		["a path outside the build output", "../index_bg.wasm.map", "inside"],
		["a missing map", "missing.wasm.map", "ENOENT"],
		["a map that isn't JSON", "invalid.wasm.map", "JSON"],
	])("throws for %s", async ([, url, message], { expect }) => {
		await expect(
			readWasmSourceMap(modulePath, wasmModule(url), "index_bg.wasm")
		).rejects.toThrow(message);
	});
});
