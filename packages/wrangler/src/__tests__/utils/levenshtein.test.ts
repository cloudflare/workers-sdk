import { describe, it } from "vitest";
import { levenshteinDistance } from "../../utils/levenshtein";

describe("levenshteinDistance", () => {
	it("should return 0 for identical strings", ({ expect }) => {
		expect(levenshteinDistance("hello", "hello")).toBe(0);
	});

	it("should return the length of the other string when one is empty", ({
		expect,
	}) => {
		expect(levenshteinDistance("", "hello")).toBe(5);
		expect(levenshteinDistance("hello", "")).toBe(5);
	});

	it("should return 0 for two empty strings", ({ expect }) => {
		expect(levenshteinDistance("", "")).toBe(0);
	});

	it("should handle single character insertions", ({ expect }) => {
		expect(levenshteinDistance("whoami", "whoamio")).toBe(1);
	});

	it("should handle single character deletions", ({ expect }) => {
		expect(levenshteinDistance("deploy", "deplo")).toBe(1);
	});

	it("should handle single character substitutions", ({ expect }) => {
		expect(levenshteinDistance("deploy", "deplox")).toBe(1);
	});

	it("should handle transpositions as two edits", ({ expect }) => {
		// Standard Levenshtein treats transpositions as 2 edits (delete + insert)
		expect(levenshteinDistance("deploy", "delpoy")).toBe(2);
	});

	it("should handle completely different strings", ({ expect }) => {
		expect(levenshteinDistance("abc", "xyz")).toBe(3);
	});

	it("should be symmetric", ({ expect }) => {
		expect(levenshteinDistance("kitten", "sitting")).toBe(
			levenshteinDistance("sitting", "kitten")
		);
	});

	it("should handle single character strings", ({ expect }) => {
		expect(levenshteinDistance("a", "b")).toBe(1);
		expect(levenshteinDistance("a", "a")).toBe(0);
		expect(levenshteinDistance("a", "")).toBe(1);
	});

	it("should compute correct distance for longer strings", ({ expect }) => {
		// "kitten" -> "sitting": k->s, e->i, +g = 3 edits
		expect(levenshteinDistance("kitten", "sitting")).toBe(3);
	});
});
