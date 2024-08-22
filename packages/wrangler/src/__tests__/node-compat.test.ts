import { describe, expect, it } from "vitest";
import { getNodeCompatMode } from "../node-compat";

describe("getNodeCompatMode", () => {
	it("should return v2 mode when experimental:nodejs_compat_v2 flag is present", () => {
		const result = getNodeCompatMode({
			compatibility_flags: ["experimental:nodejs_compat_v2"],
			node_compat: false,
		});
		expect(result).toEqual({
			legacy: false,
			mode: "v2",
			nodejsCompat: false,
			nodejsCompatV2: true,
		});
	});

	it("should return v1 mode when nodejs_compat flag is present", () => {
		const result = getNodeCompatMode({
			compatibility_flags: ["nodejs_compat"],
			node_compat: false,
		});
		expect(result).toEqual({
			legacy: false,
			mode: "v1",
			nodejsCompat: true,
			nodejsCompatV2: false,
		});
	});

	it("should return legacy mode when node_compat is true", () => {
		const result = getNodeCompatMode({
			compatibility_flags: [],
			node_compat: true,
		});
		expect(result).toEqual({
			legacy: true,
			mode: "legacy",
			nodejsCompat: false,
			nodejsCompatV2: false,
		});
	});

	it("should return null mode when no flags are present and node_compat is false", () => {
		const result = getNodeCompatMode({
			compatibility_flags: [],
			node_compat: false,
		});
		expect(result).toEqual({
			legacy: false,
			mode: null,
			nodejsCompat: false,
			nodejsCompatV2: false,
		});
	});

	it("should prioritize v2 over v1 when both flags are present", () => {
		const result = getNodeCompatMode({
			compatibility_flags: ["nodejs_compat", "experimental:nodejs_compat_v2"],
			node_compat: false,
		});
		expect(result).toEqual({
			legacy: false,
			mode: "v2",
			nodejsCompat: true,
			nodejsCompatV2: true,
		});
	});

	it("should prioritize v1 over legacy when both are applicable", () => {
		const result = getNodeCompatMode({
			compatibility_flags: ["nodejs_compat"],
			node_compat: true,
		});
		expect(result).toEqual({
			legacy: false,
			mode: "v1",
			nodejsCompat: true,
			nodejsCompatV2: false,
		});
	});

	it("should handle empty compatibility_flags array", () => {
		const result = getNodeCompatMode({
			compatibility_flags: [],
			node_compat: false,
		});
		expect(result).toEqual({
			legacy: false,
			mode: null,
			nodejsCompat: false,
			nodejsCompatV2: false,
		});
	});

	it("should ignore unrelated flags", () => {
		const result = getNodeCompatMode({
			compatibility_flags: ["some_other_flag"],
			node_compat: false,
		});
		expect(result).toEqual({
			legacy: false,
			mode: null,
			nodejsCompat: false,
			nodejsCompatV2: false,
		});
	});
});
