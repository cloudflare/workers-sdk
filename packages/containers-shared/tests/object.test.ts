import { describe, it } from "vitest";
import { sortObjectRecursive } from "./../src/object";

describe("sortObjectRecursive", () => {
	it("should sort object keys alphabetically", ({ expect }) => {
		expect(Object.keys(sortObjectRecursive({ b: 1, a: 2 }))).toEqual([
			"a",
			"b",
		]);
	});

	it("should preserve a null property value", ({ expect }) => {
		expect(sortObjectRecursive({ a: null })).toEqual({ a: null });
	});

	it("should preserve null entries inside arrays", ({ expect }) => {
		expect(sortObjectRecursive({ a: [null] })).toEqual({ a: [null] });
	});

	it("should preserve null nested inside an object in an array", ({
		expect,
	}) => {
		expect(sortObjectRecursive({ a: [{ b: [null, 1] }] })).toEqual({
			a: [{ b: [null, 1] }],
		});
	});

	it("should sort objects in an array that also contains null, without reordering the array", ({
		expect,
	}) => {
		const sorted = sortObjectRecursive<{ a: unknown[] }>({
			a: [{ c: 1, b: 2 }, null],
		});
		expect(sorted).toEqual({ a: [{ b: 2, c: 1 }, null] });
		expect(Object.keys(sorted.a[0] as Record<string, unknown>)).toEqual([
			"b",
			"c",
		]);
	});

	it("should not throw on a containers-style config with null in a nested array", ({
		expect,
	}) => {
		const config = {
			name: "my-container-app",
			configuration: { labels: [null], image: "registry.example.com/x:y" },
		};
		expect(() => sortObjectRecursive(config)).not.toThrow();
		expect(sortObjectRecursive(config)).toEqual({
			configuration: {
				image: "registry.example.com/x:y",
				labels: [null],
			},
			name: "my-container-app",
		});
	});
});
