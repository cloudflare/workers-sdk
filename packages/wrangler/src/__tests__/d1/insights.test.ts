import { vi } from "vitest";
import { getDurationDates } from "../../d1/insights";

describe("getDurationDates()", () => {
	beforeAll(() => {
		vi.useFakeTimers();
		//lock time to 2023-08-01 UTC
		vi.setSystemTime(new Date(2023, 7, 1));
	});

	afterAll(() => {
		vi.useRealTimers();
	});

	it("should throw an error if duration is greater than 31 days (in days)", () => {
		expect(() => getDurationDates("32d")).toThrowError(
			"Duration cannot be greater than 31 days"
		);
	});
	it("should throw an error if duration is greater than 31 days (in minutes)", () => {
		expect(() => getDurationDates("44641m")).toThrowError(
			"Duration cannot be greater than 44640 minutes (31 days)"
		);
	});

	it("should throw an error if duration is greater than 31 days (in hours)", () => {
		expect(() => getDurationDates("745h")).toThrowError(
			"Duration cannot be greater than 744 hours (31 days)"
		);
	});

	it("should throw an error if duration unit is invalid", () => {
		expect(() => getDurationDates("1y")).toThrowError("Invalid duration unit");
	});

	it("should return the correct start and end dates", () => {
		const [startDate, endDate] = getDurationDates("5d");

		expect(+new Date(startDate)).toBe(+new Date(2023, 6, 27));
		expect(+new Date(endDate)).toBe(+new Date(2023, 7, 1));
	});
});
