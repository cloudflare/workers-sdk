import assert from "node:assert";
import {
	assertCompatDate,
	formatCompatibilityDate,
	getLocalWorkerdCompatibilityDate,
	isCompatDate,
} from "miniflare";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

describe("isCompatDate", () => {
	test("returns true for valid date strings", ({ expect }) => {
		expect(isCompatDate("2024-01-15")).toBe(true);
		expect(isCompatDate("2023-12-31")).toBe(true);
		expect(isCompatDate("2000-01-01")).toBe(true);
		expect(isCompatDate("9999-12-31")).toBe(true);
	});

	test("returns false for invalid date formats", ({ expect }) => {
		// Missing leading zeros
		expect(isCompatDate("2024-1-15")).toBe(false);
		expect(isCompatDate("2024-01-5")).toBe(false);

		// Wrong separators
		expect(isCompatDate("2024/01/15")).toBe(false);
		expect(isCompatDate("2024.01.15")).toBe(false);

		// Wrong length
		expect(isCompatDate("24-01-15")).toBe(false);
		expect(isCompatDate("2024-001-15")).toBe(false);

		// Invalid strings
		expect(isCompatDate("not-a-date")).toBe(false);
		expect(isCompatDate("")).toBe(false);
		expect(isCompatDate("2024")).toBe(false);
		expect(isCompatDate("2024-01")).toBe(false);

		// Extra characters
		expect(isCompatDate("2024-01-15T00:00:00")).toBe(false);
		expect(isCompatDate(" 2024-01-15")).toBe(false);
		expect(isCompatDate("2024-01-15 ")).toBe(false);
	});
});

describe("assertCompatDate", () => {
	test("does not throw for valid date strings", ({ expect }) => {
		expect(() => assertCompatDate("2024-01-15")).not.toThrow();
		expect(() => assertCompatDate("2023-12-31")).not.toThrow();
		expect(() => assertCompatDate("2000-01-01")).not.toThrow();
	});

	test("throws AssertionError for invalid date formats", ({ expect }) => {
		expect(() => assertCompatDate("2024-1-15")).toThrow(assert.AssertionError);
		expect(() => assertCompatDate("not-a-date")).toThrow(assert.AssertionError);
		expect(() => assertCompatDate("")).toThrow(assert.AssertionError);
		expect(() => assertCompatDate("2024/01/15")).toThrow(assert.AssertionError);
	});
});

describe("formatCompatibilityDate", () => {
	test("returns correctly formatted date string", ({ expect }) => {
		// Use UTC dates to avoid timezone issues
		const date = new Date(Date.UTC(2024, 0, 15)); // January 15, 2024
		expect(formatCompatibilityDate(date)).toBe("2024-01-15");
	});

	test("pads single-digit months and days with zeros", ({ expect }) => {
		const date1 = new Date(Date.UTC(2024, 0, 1)); // January 1, 2024
		expect(formatCompatibilityDate(date1)).toBe("2024-01-01");

		const date2 = new Date(Date.UTC(2024, 8, 5)); // September 5, 2024
		expect(formatCompatibilityDate(date2)).toBe("2024-09-05");
	});

	test("handles year boundaries correctly", ({ expect }) => {
		const date1 = new Date(Date.UTC(2023, 11, 31)); // December 31, 2023
		expect(formatCompatibilityDate(date1)).toBe("2023-12-31");

		const date2 = new Date(Date.UTC(2024, 0, 1)); // January 1, 2024
		expect(formatCompatibilityDate(date2)).toBe("2024-01-01");
	});

	test("handles various years correctly", ({ expect }) => {
		const date1 = new Date(Date.UTC(2000, 5, 15));
		expect(formatCompatibilityDate(date1)).toBe("2000-06-15");

		const date2 = new Date(Date.UTC(2099, 11, 31));
		expect(formatCompatibilityDate(date2)).toBe("2099-12-31");
	});
});

describe("getLocalWorkerdCompatibilityDate", () => {
	test("returns a valid compat date string", ({ expect }) => {
		const result = getLocalWorkerdCompatibilityDate();

		// Should match YYYY-MM-DD format
		expect(isCompatDate(result)).toBe(true);

		// Should be parseable as a date
		const parsed = new Date(result);
		expect(parsed.toString()).not.toBe("Invalid Date");
	});

	test("returns a date that is not in the future", ({ expect }) => {
		const result = getLocalWorkerdCompatibilityDate();
		const resultDate = new Date(result);
		const now = new Date();

		// The returned date should not be after today (in UTC)
		// We compare timestamps at midnight UTC for both dates
		const resultTimestamp = Date.UTC(
			resultDate.getUTCFullYear(),
			resultDate.getUTCMonth(),
			resultDate.getUTCDate()
		);
		const todayTimestamp = Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth(),
			now.getUTCDate()
		);

		expect(resultTimestamp).toBeLessThanOrEqual(todayTimestamp);
	});

	describe("toSafeCompatibilityDate", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		test("uses today's date when workerd date would be in the future", ({
			expect,
		}) => {
			// Set the current time to a specific date
			const mockDate = new Date(Date.UTC(2024, 0, 15, 12, 0, 0)); // Jan 15, 2024 noon UTC
			vi.setSystemTime(mockDate);

			const result = getLocalWorkerdCompatibilityDate();

			// The result should be a valid compat date
			expect(isCompatDate(result)).toBe(true);

			// The result should not be in the future relative to the mocked time
			const resultDate = new Date(result);
			expect(resultDate.getTime()).toBeLessThanOrEqual(mockDate.getTime());
		});

		test("returns consistent format regardless of system time", ({
			expect,
		}) => {
			// Test with different times of day
			const times = [
				new Date(Date.UTC(2024, 5, 15, 0, 0, 0)), // midnight
				new Date(Date.UTC(2024, 5, 15, 12, 0, 0)), // noon
				new Date(Date.UTC(2024, 5, 15, 23, 59, 59)), // end of day
			];

			for (const time of times) {
				vi.setSystemTime(time);
				const result = getLocalWorkerdCompatibilityDate();
				expect(isCompatDate(result)).toBe(true);
			}
		});
	});
});
