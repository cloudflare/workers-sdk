import { describe, it } from "vitest";
import {
	getWasmSourceMappingUrl,
	setWasmSourceMappingUrl,
} from "../src/wasm-source-mapping-url";

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

describe("setWasmSourceMappingUrl", () => {
	it("replaces the section, keeping the others", ({ expect }) => {
		const type = [1, [0]] as [number, number[]];
		const producers = [0, [...name("producers"), 0]] as [number, number[]];
		const bytes = wasmModule(
			type,
			[0, [...name("sourceMappingURL"), ...name("index_bg.wasm.map")]],
			producers
		);

		expect(setWasmSourceMappingUrl(bytes, "a.wasm.map")).toEqual(
			wasmModule(
				type,
				[0, [...name("sourceMappingURL"), ...name("a.wasm.map")]],
				producers
			)
		);
	});

	it("appends a section to a module without one", ({ expect }) => {
		const bytes = wasmModule([1, [0]]);
		const updated = setWasmSourceMappingUrl(bytes, "a.wasm.map");

		expect(updated.subarray(0, bytes.length)).toEqual(bytes);
		expect(getWasmSourceMappingUrl(updated)).toBe("a.wasm.map");
	});

	it("writes a URL longer than one LEB128 byte can size", ({ expect }) => {
		const url = `${"a".repeat(200)}.wasm.map`;

		expect(
			getWasmSourceMappingUrl(setWasmSourceMappingUrl(wasmModule(), url))
		).toBe(url);
	});

	it("throws for bytes that aren't a module", ({ expect }) => {
		expect(() =>
			setWasmSourceMappingUrl(new Uint8Array([1, 2, 3]), "a.wasm.map")
		).toThrow("Expected a WebAssembly module.");
	});
});
