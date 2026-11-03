import { describe, it } from "vitest";
import { getWasmSourceMappingUrl } from "../src/wasm-source-mapping-url";

/** Encodes `text` as a WebAssembly name: its UTF-8 length, then its bytes. */
function name(text: string): number[] {
	const bytes = new TextEncoder().encode(text);
	return [bytes.length, ...bytes];
}

/** Builds a WebAssembly module with the given sections, each `[id, payload]`. */
function wasmModule(...sections: [number, number[]][]): Uint8Array {
	return new Uint8Array([
		...[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00],
		...sections.flatMap(([id, payload]) => [id, payload.length, ...payload]),
	]);
}

describe("getWasmSourceMappingUrl", () => {
	it("reads the URL after other sections", ({ expect }) => {
		const bytes = wasmModule(
			[1, [0]], // An empty type section.
			[0, [...name("producers"), 0]],
			[0, [...name("sourceMappingURL"), ...name("index_bg.wasm.map")]]
		);

		expect(getWasmSourceMappingUrl(bytes)).toBe("index_bg.wasm.map");
	});

	it("returns undefined without a sourceMappingURL section", ({ expect }) => {
		expect(
			getWasmSourceMappingUrl(wasmModule([0, [...name("producers"), 0]]))
		).toBeUndefined();
	});

	it("returns undefined for bytes that aren't a module", ({ expect }) => {
		expect(
			getWasmSourceMappingUrl(new TextEncoder().encode("SOME WASM CONTENT"))
		).toBeUndefined();
	});

	it("returns undefined for a truncated module", ({ expect }) => {
		const bytes = wasmModule([
			0,
			[...name("sourceMappingURL"), ...name("index_bg.wasm.map")],
		]);

		expect(getWasmSourceMappingUrl(bytes.subarray(0, 12))).toBeUndefined();
		expect(getWasmSourceMappingUrl(bytes.subarray(0, 30))).toBeUndefined();
	});
});
