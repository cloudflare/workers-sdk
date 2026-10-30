import { describe, it } from "vitest";
import {
	getSourceMappedStack,
	getSourceMappedString,
} from "../src/deploy/helpers/sourcemap";

describe("getSourceMappedString", () => {
	it("returns original value when source mapping throws", ({ expect }) => {
		const value = `Error: test\n    at Object.<anonymous> (/some/file.js:1:1)`;

		const result = getSourceMappedString(value, () => {
			throw new Error("simulated source map failure");
		});

		expect(result).toBe(value);
	});

	it("leaves WebAssembly call sites unchanged", ({ expect }) => {
		const value = [
			"RuntimeError: unreachable",
			"    at app.wasm.my_crate::handler (wasm://wasm/app.wasm-047589b6:wasm-function[3732]:0x95c16)",
			"    at fetch (file:///worker/index.js:2:20008)",
		].join("\n");

		expect(getSourceMappedString(value, () => null)).toBe(value);
	});
});

describe("getSourceMappedStack", () => {
	it("stringifies WebAssembly call frames", ({ expect }) => {
		const frame = { scriptId: "1", lineNumber: 0 };
		const stack = getSourceMappedStack({
			exceptionId: 1,
			text: "Uncaught",
			lineNumber: 0,
			columnNumber: 0,
			exception: { type: "object", description: "RuntimeError: unreachable" },
			stackTrace: {
				callFrames: [
					{
						...frame,
						functionName: "my_crate::handler",
						url: "wasm://wasm/app.wasm-047589b6",
						columnNumber: 613398,
					},
					{
						...frame,
						functionName: "fetch",
						url: "file:///worker/index.js",
						columnNumber: 20007,
					},
				],
			},
		});

		expect(stack).toBe(
			[
				"RuntimeError: unreachable",
				"    at my_crate::handler (wasm://wasm/app.wasm-047589b6:1:613399)",
				"    at fetch (file:///worker/index.js:1:20008)",
			].join("\n")
		);
	});
});
