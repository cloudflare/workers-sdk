import { describe, it } from "vitest";
import { createCronRow } from "../../components/cron-triggers/row-state";
import {
	enterCustomTimeMode,
	formatUtcCalendarValue,
	MAX_DATE_EPOCH_MS,
	MIN_DATE_EPOCH_MS,
	parseEpochMilliseconds,
	resolveUtcCalendarTime,
} from "../../components/cron-triggers/scheduled-time";

describe("Cron Trigger scheduled-time conversion", () => {
	it("converts UTC calendar values without losing milliseconds", ({
		expect,
	}) => {
		const resolved = resolveUtcCalendarTime("2026-01-10T12:30:45.123");
		expect(resolved).toEqual({
			kind: "exact",
			epochMs: 1_768_048_245_123,
			utc: "2026-01-10T12:30:45.123Z",
		});
		if (resolved.kind === "exact") {
			expect(formatUtcCalendarValue(resolved.epochMs)).toBe(
				"2026-01-10T12:30:45.123"
			);
		}
	});

	it("enforces scheduled-time boundaries for UTC calendar values", ({
		expect,
	}) => {
		for (const epochMs of [
			MIN_DATE_EPOCH_MS,
			MIN_DATE_EPOCH_MS + 1,
			MAX_DATE_EPOCH_MS - 1,
			MAX_DATE_EPOCH_MS,
		]) {
			expect(
				resolveUtcCalendarTime(formatUtcCalendarValue(epochMs))
			).toMatchObject({ kind: "exact", epochMs });
		}
		for (const epochMs of [MIN_DATE_EPOCH_MS - 1, MAX_DATE_EPOCH_MS + 1]) {
			expect(resolveUtcCalendarTime(formatUtcCalendarValue(epochMs))).toEqual({
				error: "Date and time are outside the supported scheduled-time range.",
				kind: "invalid",
			});
		}
	});

	it("rejects calendar years and UTC dates outside supported values", ({
		expect,
	}) => {
		for (const value of [
			"0001-01-01T00:00:00.000",
			"9999-12-31T23:59:59.999",
			"0000-01-01T00:00:00.000",
			"2026-02-29T00:00:00.000",
			"2026-01-01T24:00:00.000",
		]) {
			expect(resolveUtcCalendarTime(value).kind).toBe("invalid");
		}
	});

	it("accepts scheduled-time boundaries, zero, and negative epochs", ({
		expect,
	}) => {
		for (const value of ["-9223372036854", "-1", "0", "9223372036854"]) {
			expect(parseEpochMilliseconds(value).epochMs).toBe(Number(value));
		}
		expect(parseEpochMilliseconds("1.5").error).toBeDefined();
		expect(parseEpochMilliseconds("-9223372036855").error).toBeDefined();
		expect(parseEpochMilliseconds("9223372036855").error).toBeDefined();
	});

	it("preserves existing custom values when returning from now mode", ({
		expect,
	}) => {
		const calendar = enterCustomTimeMode(
			{
				...createCronRow("* * * * *"),
				calendarValue: "2026-01-10T12:30:45.123",
				timeMode: "now",
			},
			999
		);
		expect(calendar).toMatchObject({
			calendarValue: "2026-01-10T12:30:45.123",
			customEpochMs: 1_768_048_245_123,
			timeMode: "custom",
		});

		const epoch = enterCustomTimeMode(
			{
				...createCronRow("* * * * *"),
				customTimeInputMode: "epoch",
				epochValue: "123456789",
				timeMode: "now",
			},
			999
		);
		expect(epoch).toMatchObject({
			customEpochMs: 123_456_789,
			epochValue: "123456789",
			timeMode: "custom",
		});
	});
});
