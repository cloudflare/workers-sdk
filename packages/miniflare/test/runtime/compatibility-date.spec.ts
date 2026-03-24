import {
	formatCompatibilityDate,
	isCompatDate,
	supportedCompatibilityDate,
} from "miniflare";
import { describe, test } from "vitest";

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

describe("formatCompatibilityDate", () => {
	test("returns correctly formatted date string", ({ expect }) => {
		// Use UTC dates to avoid timezone issues
		const date = new Date(Date.UTC(2024, 0, 15));
		expect(formatCompatibilityDate(date)).toBe("2024-01-15");
	});

	test("pads single-digit months and days with zeros", ({ expect }) => {
		const date1 = new Date(Date.UTC(2024, 0, 1));
		expect(formatCompatibilityDate(date1)).toBe("2024-01-01");

		const date2 = new Date(Date.UTC(2024, 8, 5));
		expect(formatCompatibilityDate(date2)).toBe("2024-09-05");
	});

	test("handles year boundaries correctly", ({ expect }) => {
		const date1 = new Date(Date.UTC(2023, 11, 31));
		expect(formatCompatibilityDate(date1)).toBe("2023-12-31");

		const date2 = new Date(Date.UTC(2024, 0, 1));
		expect(formatCompatibilityDate(date2)).toBe("2024-01-01");
	});

	test("handles various years correctly", ({ expect }) => {
		const date1 = new Date(Date.UTC(2000, 5, 15));
		expect(formatCompatibilityDate(date1)).toBe("2000-06-15");

		const date2 = new Date(Date.UTC(2099, 11, 31));
		expect(formatCompatibilityDate(date2)).toBe("2099-12-31");
	});
});

describe("supportedCompatibilityDate", () => {
	test("returns a valid compat date string", ({ expect }) => {
		expect(isCompatDate(supportedCompatibilityDate)).toBe(true);
	});

	test("should be parseable as a date", ({ expect }) => {
		const parsed = new Date(supportedCompatibilityDate);
		expect(parsed.toString()).not.toBe("Invalid Date");
	});

	test("should not be in the future", ({ expect }) => {
		const supportedCompatibilityDateAsDate = new Date(
			supportedCompatibilityDate
		);
		const now = new Date();

		// The returned date should not be after today (in UTC)
		// We compare timestamps at midnight UTC for both dates
		const resultTimestamp = Date.UTC(
			supportedCompatibilityDateAsDate.getUTCFullYear(),
			supportedCompatibilityDateAsDate.getUTCMonth(),
			supportedCompatibilityDateAsDate.getUTCDate()
		);
		const todayTimestamp = Date.UTC(
			now.getUTCFullYear(),
			now.getUTCMonth(),
			now.getUTCDate()
		);

		expect(resultTimestamp).toBeLessThanOrEqual(todayTimestamp);
	});
});
