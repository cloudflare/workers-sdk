import { describe, it } from "vitest";
import { isCompatDate, getTodaysCompatDate } from "../src/compatibility-date";

describe("getTodaysCompatDate()", () => {
	it("should be a valid compat date in YYYY-MM-DD format", ({ expect }) => {
		expect(isCompatDate(getTodaysCompatDate())).toBe(true);
	});

	it("should equal today's UTC date", ({ expect }) => {
		const expected = new Date().toISOString().slice(0, 10);
		expect(getTodaysCompatDate()).toBe(expected);
	});
});

describe("isCompatDate", () => {
	it("should return true for valid compat dates", ({ expect }) => {
		expect(isCompatDate("2025-01-10")).toBe(true);
		expect(isCompatDate("2000-12-31")).toBe(true);
	});

	it("should return false for invalid compat dates", ({ expect }) => {
		expect(isCompatDate("2025-1-10")).toBe(false);
		expect(isCompatDate("not-a-date")).toBe(false);
		expect(isCompatDate("")).toBe(false);
		expect(isCompatDate("2025-01-101")).toBe(false);
	});
});
