import { describe, it } from "vitest";
import { isFrameworkSupported } from "../../../autoconfig/frameworks";

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
