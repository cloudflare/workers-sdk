import { describe, it } from "vitest";
import { sortObjectRecursive } from "../../utils/sortObjectRecursive";

describe("sortObjectRecursive", () => {
	it("should sort object keys alphabetically", ({ expect }) => {
		expect(Object.keys(sortObjectRecursive({ b: 1, a: 2 }))).toEqual(["a", "b"]);
	});

	it("should sort nested object keys recursively", ({ expect }) => {
		const sorted = sortObjectRecursive<{ outer: Record<string, unknown> }>({
			outer: { b: 1, a: 2 },
		});
		expect(Object.keys(sorted.outer)).toEqual(["a", "b"]);
	});

	it("should preserve a null property value", ({ expect }) => {
		expect(sortObjectRecursive({ a: null })).toEqual({ a: null });
	});

	it("should preserve null entries inside arrays", ({ expect }) => {
		expect(sortObjectRecursive({ a: [null] })).toEqual({ a: [null] });
	});

	it("should sort objects in an array that also contains null", ({ expect }) => {
		expect(sortObjectRecursive({ a: [{ c: 1, b: 2 }, null] })).toEqual({
			a: [{ b: 2, c: 1 }, null],
		});
	});
});
