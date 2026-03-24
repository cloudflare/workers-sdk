import { describe, it } from "vitest";
import { isKnownFramework } from "../../../autoconfig/frameworks";

describe("isKnownFramework()", () => {
	it("should return true for a known supported framework id", ({ expect }) => {
		expect(isKnownFramework("astro")).toBe(true);
	});

	it("should return true for a known but unsupported framework id", ({
		expect,
	}) => {
		expect(isKnownFramework("hono")).toBe(true);
	});

	it('should return true for the "static" framework id', ({ expect }) => {
		expect(isKnownFramework("static")).toBe(true);
	});

	it("should return false for an unknown framework id", ({ expect }) => {
		expect(isKnownFramework("unknown-framework")).toBe(false);
	});
});
