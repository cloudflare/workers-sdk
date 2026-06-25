import { describe, it } from "vitest";
import { isValidIdentifier, normalizeIdentifier } from "../src/identifiers";

describe("identifiers", () => {
	describe("isValidIdentifier", () => {
		it("accepts valid identifiers", ({ expect }) => {
			expect(isValidIdentifier("foo")).toBe(true);
			expect(isValidIdentifier("_foo")).toBe(true);
			expect(isValidIdentifier("$foo")).toBe(true);
			expect(isValidIdentifier("foo123")).toBe(true);
			expect(isValidIdentifier("myFunction")).toBe(true);
		});

		it("rejects reserved keywords", ({ expect }) => {
			expect(isValidIdentifier("const")).toBe(false);
			expect(isValidIdentifier("let")).toBe(false);
			expect(isValidIdentifier("class")).toBe(false);
			expect(isValidIdentifier("function")).toBe(false);
			expect(isValidIdentifier("return")).toBe(false);
		});

		it("rejects invalid identifiers", ({ expect }) => {
			expect(isValidIdentifier("123foo")).toBe(false);
			expect(isValidIdentifier("foo-bar")).toBe(false);
			expect(isValidIdentifier("foo bar")).toBe(false);
		});
	});

	describe("normalizeIdentifier", () => {
		it("replaces invalid characters with underscores", ({ expect }) => {
			expect(normalizeIdentifier("foo-bar")).toBe("foo_bar");
			expect(normalizeIdentifier("foo.bar")).toBe("foo_bar");
			expect(normalizeIdentifier("foo/bar")).toBe("foo_bar");
			expect(normalizeIdentifier("123foo")).toBe("_23foo");
		});

		it("preserves valid characters", ({ expect }) => {
			expect(normalizeIdentifier("foo")).toBe("foo");
			expect(normalizeIdentifier("_foo")).toBe("_foo");
			expect(normalizeIdentifier("$foo")).toBe("$foo");
			expect(normalizeIdentifier("foo123")).toBe("foo123");
		});
	});
});
