import { describe, test } from "vitest";
import { formatDate } from "../../utils/format";

describe("formatDate", () => {
	test("`undefined` returns '-'", ({ expect }) => {
		expect(formatDate(undefined)).toBe("-");
	});

	test("empty string returns '-'", ({ expect }) => {
		expect(formatDate("")).toBe("-");
	});

	test("valid ISO date string", ({ expect }) => {
		expect(formatDate("2025-05-13T01:11:37.000Z")).toBe(
			"13 May 2025, 01:11:37 UTC"
		);
	});

	test("different month (January)", ({ expect }) => {
		expect(formatDate("2024-01-05T12:30:45.000Z")).toBe(
			"5 Jan 2024, 12:30:45 UTC"
		);
	});

	test("single-digit day (no leading zero)", ({ expect }) => {
		expect(formatDate("2025-03-01T00:00:00.000Z")).toBe(
			"1 Mar 2025, 00:00:00 UTC"
		);
	});

	test("end of year date", ({ expect }) => {
		expect(formatDate("2025-12-31T23:59:59.000Z")).toBe(
			"31 Dec 2025, 23:59:59 UTC"
		);
	});

	test("invalid date string returns '-'", ({ expect }) => {
		expect(formatDate("not-a-date")).toBe("-");
	});

	test("malformed date string returns '-'", ({ expect }) => {
		expect(formatDate("2025-13-45")).toBe("-");
	});

	test("random string returns '-'", ({ expect }) => {
		expect(formatDate("hello world")).toBe("-");
	});
});
