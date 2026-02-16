import { describe, it } from "vitest";
import {
	fromMimeType,
	moduleTypeMimeType,
} from "../../deployment-bundle/create-worker-upload-form";

describe("moduleTypeMimeType", () => {
	it.for([
		["esm", "application/javascript+module"],
		["commonjs", "application/javascript"],
		["compiled-wasm", "application/wasm"],
		["buffer", "application/octet-stream"],
		["text", "text/plain"],
		["python", "text/x-python"],
		["python-requirement", "text/x-python-requirement"],
	] as const)(
		"should map %s to %s",
		([moduleType, expectedMime], { expect }) => {
			expect(moduleTypeMimeType[moduleType]).toBe(expectedMime);
		}
	);
});

describe("fromMimeType", () => {
	it.for([
		["application/javascript+module", "esm"],
		["application/javascript", "commonjs"],
		["application/wasm", "compiled-wasm"],
		["application/octet-stream", "buffer"],
	] as const)(
		"should reverse-map %s to %s",
		([mime, expectedType], { expect }) => {
			expect(fromMimeType(mime)).toBe(expectedType);
		}
	);

	it("should throw for unsupported mime types", ({ expect }) => {
		expect(() => fromMimeType("image/png")).toThrowError(
			"Unsupported mime type: image/png"
		);
	});
});
