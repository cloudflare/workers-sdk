import { describe, test } from "vitest";
import {
	parseVariationValue,
	shellQuote,
	validateFlagKey,
} from "../../components/flagship/flag-helpers";

describe("validateFlagKey", () => {
	test("validates syntax and length", ({ expect }) => {
		const cases: Array<[string, string | null]> = [
			["new_ui-2", null],
			["   ", "Enter a flag key."],
			["new ui", "Use only letters, numbers, hyphens, and underscores."],
			["a".repeat(65), "Flag key must be 64 characters or fewer."],
		];
		for (const [key, error] of cases) {
			expect(validateFlagKey(key, new Set())).toBe(error);
		}
	});

	test("checks duplicates case-sensitively", ({ expect }) => {
		const existing = new Set(["new-ui"]);
		expect(validateFlagKey("new-ui", existing)).toContain("already exists");
		expect(validateFlagKey("New-UI", existing)).toBeNull();
	});
});

describe("parseVariationValue", () => {
	test("rejects non-finite numbers", ({ expect }) => {
		for (const value of ["Infinity", "NaN", ""]) {
			expect(parseVariationValue("number", value).ok).toBe(false);
		}
	});

	test("parses finite numbers and structured JSON", ({ expect }) => {
		expect(parseVariationValue("number", "33.5")).toEqual({
			ok: true,
			value: 33.5,
		});
		expect(parseVariationValue("json", '[{"enabled":true}]')).toEqual({
			ok: true,
			value: [{ enabled: true }],
		});
	});

	test("rejects JSON primitives", ({ expect }) => {
		for (const value of ["null", "true", "1", '"value"']) {
			expect(parseVariationValue("json", value).ok).toBe(false);
		}
	});
});

test("shellQuote escapes shell syntax and embedded quotes", ({ expect }) => {
	expect(shellQuote("$(whoami)")).toBe("'$(whoami)'");
	expect(shellQuote("it's")).toBe("'it'\\''s'");
});
