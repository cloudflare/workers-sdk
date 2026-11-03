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
	const modulePath = path.join(dir, "pkg", "index_bg.wasm");
	fs.mkdirSync(path.join(dir, "pkg"));
	fs.mkdirSync(path.join(dir, "maps"));
	const map = { version: 3, file: "index_bg.wasm", mappings: "" };
	fs.writeFileSync(
		path.join(dir, "pkg", "index_bg.wasm.map"),
		JSON.stringify(map)
	);
	fs.writeFileSync(
		path.join(dir, "maps", "index_bg.wasm.map"),
		JSON.stringify(map)
	);
	fs.writeFileSync(path.join(dir, "pkg", "invalid.wasm.map"), "not json");

	it("reads the map and names it after the module", async ({ expect }) => {
		expect(
			await readWasmSourceMap(modulePath, wasmModule("index_bg.wasm.map"))
		).toEqual({
			fileName: expect.stringMatching(/^index_bg-[\da-f]{8}\.wasm\.map$/),
			sourceMap: map,
		});
	});

	it("reads a map from another directory", async ({ expect }) => {
		expect(
			await readWasmSourceMap(
				modulePath,
				wasmModule("../maps/index_bg.wasm.map")
			)
		).toMatchObject({ sourceMap: map });
	});

	it("names the maps of different modules differently", async ({ expect }) => {
		const a = await readWasmSourceMap(
			modulePath,
			wasmModule("index_bg.wasm.map")
		);
		const b = await readWasmSourceMap(
			modulePath,
			wasmModule("../maps/index_bg.wasm.map")
		);

		expect(a?.fileName).not.toBe(b?.fileName);
	});

	it.for([
		["no sourceMappingURL section", undefined],
		["an absolute URL", "https://example.com/index_bg.wasm.map"],
	])("returns undefined for %s", async ([, url], { expect }) => {
		expect(
			await readWasmSourceMap(modulePath, wasmModule(url))
		).toBeUndefined();
	});

	it.for([
		["a data URL", "data:application/json;base64,e30=", "data URL"],
		["a missing map", "missing.wasm.map", "ENOENT"],
		["a map that isn't JSON", "invalid.wasm.map", "JSON"],
	])("throws for %s", async ([, url, message], { expect }) => {
		await expect(
			readWasmSourceMap(modulePath, wasmModule(url))
		).rejects.toThrow(message);
	});
});
