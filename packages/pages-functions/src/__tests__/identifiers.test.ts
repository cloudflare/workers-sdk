import { describe, it } from "vitest";
import { isValidIdentifier, normalizeIdentifier } from "../index";

describe("identifiers", () => {
	it("should validate identifiers correctly", ({ expect }) => {
		expect(isValidIdentifier("foo")).toBe(true);
		expect(isValidIdentifier("_bar")).toBe(true);
		expect(isValidIdentifier("$baz")).toBe(true);
		expect(isValidIdentifier("class")).toBe(false);
		expect(isValidIdentifier("123")).toBe(false);
	});

	it("should normalize identifiers", ({ expect }) => {
		expect(normalizeIdentifier("hello-world")).toBe("hello_world");
		expect(normalizeIdentifier("123abc")).toBe("_23abc");
	});
});
