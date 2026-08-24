import { describe, test } from "vitest";
import {
	parseVariationValue,
	shellQuote,
	validateFlagKey,
} from "../../components/flagship/flag-helpers";

describe("validateFlagKey", () => {
	test("accepts letters, numbers, hyphens and underscores", ({ expect }) => {
		expect(validateFlagKey("new_ui-2", new Set())).toBeNull();
	});

	test("requires a key", ({ expect }) => {
		expect(validateFlagKey("   ", new Set())).toBe("Enter a flag key.");
	});

	test("rejects characters the control plane does not allow", ({ expect }) => {
		expect(validateFlagKey("new ui", new Set())).toBe(
			"Use only letters, numbers, hyphens, and underscores."
		);
		expect(validateFlagKey("new.ui", new Set())).toBe(
			"Use only letters, numbers, hyphens, and underscores."
		);
	});

	test("reports the length limit separately", ({ expect }) => {
		expect(validateFlagKey("a".repeat(65), new Set())).toBe(
			"Flag key must be 64 characters or fewer."
		);
		expect(validateFlagKey("a".repeat(64), new Set())).toBeNull();
	});

	test("compares existing keys case-sensitively", ({ expect }) => {
		const existing = new Set(["new-ui"]);

		expect(validateFlagKey("new-ui", existing)).toBe(
			"A flag with this key already exists in this application."
		);
		expect(validateFlagKey("New-UI", existing)).toBeNull();
	});
});

describe("parseVariationValue", () => {
	test("rejects numbers that are not finite", ({ expect }) => {
		expect(parseVariationValue("number", "Infinity")).toEqual({
			error: "Number values must be numeric.",
			ok: false,
		});
		expect(parseVariationValue("number", "NaN")).toEqual({
			error: "Number values must be numeric.",
			ok: false,
		});
		expect(parseVariationValue("number", "")).toEqual({
			error: "Number values must be numeric.",
			ok: false,
		});
	});

	test("accepts finite numbers, including fractions", ({ expect }) => {
		expect(parseVariationValue("number", "33.5")).toEqual({
			ok: true,
			value: 33.5,
		});
	});

	test("accepts JSON objects and arrays", ({ expect }) => {
		expect(parseVariationValue("json", '{"enabled":true}')).toEqual({
			ok: true,
			value: { enabled: true },
		});
		expect(parseVariationValue("json", "[1,2]")).toEqual({
			ok: true,
			value: [1, 2],
		});
	});

	test("rejects JSON null and primitives", ({ expect }) => {
		for (const value of ["null", "true", "1", '"value"']) {
			expect(parseVariationValue("json", value)).toEqual({
				error: "JSON values must be objects or arrays.",
				ok: false,
			});
		}
	});
});

describe("shellQuote", () => {
	test("wraps a plain value in single quotes", ({ expect }) => {
		expect(shellQuote("http://localhost/api")).toBe("'http://localhost/api'");
	});

	test("keeps shell expansions inert", ({ expect }) => {
		expect(shellQuote("$(rm -rf /)")).toBe("'$(rm -rf /)'");
		expect(shellQuote("`whoami`")).toBe("'`whoami`'");
	});

	test("escapes embedded single quotes", ({ expect }) => {
		expect(shellQuote(`it's`)).toBe(`'it'\\''s'`);
	});
});
