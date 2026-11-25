import { describe, it } from "vitest";
import {
	isFrameworkSupported,
	requiresFrameworkSetup,
} from "../../src/frameworks";

describe("isFrameworkSupported()", () => {
	it("should return true for a supported framework id", ({ expect }) => {
		expect(isFrameworkSupported("astro")).toBe(true);
	});

	it("should return false for a known but unsupported framework id", ({
		expect,
	}) => {
		expect(isFrameworkSupported("hono")).toBe(false);
	});

	it("should throw for an unknown framework id", ({ expect }) => {
		expect(() => isFrameworkSupported("unknown-framework")).toThrow(
			'Unexpected unknown framework id: "unknown-framework"'
		);
	});
});

describe("requiresFrameworkSetup()", () => {
	it.for([
		{ id: "astro", expected: true },
		{ id: "react-router", expected: true },
		{ id: "vite", expected: true },
		{ id: "static", expected: false },
		{ id: "next", expected: false },
		{ id: "nuxt", expected: false },
		{ id: "hono", expected: false },
	])("returns $expected for $id", ({ id, expected }, { expect }) => {
		expect(requiresFrameworkSetup(id)).toBe(expected);
	});
});
