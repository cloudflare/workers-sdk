import { describe, it } from "vitest";
import { getSourceMappedString } from "../src/deploy/helpers/sourcemap";

describe("getSourceMappedString", () => {
	it("returns original value when source mapping throws", ({ expect }) => {
		const value = `Error: test\n    at Object.<anonymous> (/some/file.js:1:1)`;

		const result = getSourceMappedString(value, () => {
			throw new Error("simulated source map failure");
		});

		expect(result).toBe(value);
	});
});
