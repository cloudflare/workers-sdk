import type { CronRow } from "./types";

export const MIN_DATE_EPOCH_MS = -9_223_372_036_854;
export const MAX_DATE_EPOCH_MS = 9_223_372_036_854;

export type UtcCalendarResolution =
	| { kind: "invalid"; error: string }
	| { kind: "exact"; epochMs: number; utc: string };

const UTC_CALENDAR_PATTERN =
	/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

/** Resolve an explicitly UTC calendar value using UTC getters and setters only. */
export function resolveUtcCalendarTime(value: string): UtcCalendarResolution {
	const match = UTC_CALENDAR_PATTERN.exec(value);
	if (!match) {
		return {
			kind: "invalid",
			error:
				"Enter a UTC date and time with a four-digit year and optional milliseconds.",
		};
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);
	const second = Number(match[6] ?? "0");
	const millisecond = Number((match[7] ?? "0").padEnd(3, "0"));
	if (year < 1 || year > 9999) {
		return { kind: "invalid", error: "Year must be between 0001 and 9999." };
	}

	const date = new Date(0);
	date.setUTCFullYear(year, month - 1, day);
	date.setUTCHours(hour, minute, second, millisecond);
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day ||
		date.getUTCHours() !== hour ||
		date.getUTCMinutes() !== minute ||
		date.getUTCSeconds() !== second ||
		date.getUTCMilliseconds() !== millisecond
	) {
		return {
			kind: "invalid",
			error: "Enter a valid UTC calendar date and time.",
		};
	}

	const epochMs = date.getTime();
	if (epochMs < MIN_DATE_EPOCH_MS || epochMs > MAX_DATE_EPOCH_MS) {
		return {
			kind: "invalid",
			error: "Date and time are outside the supported scheduled-time range.",
		};
	}
	return { kind: "exact", epochMs, utc: date.toISOString() };
}

export function parseEpochMilliseconds(value: string): {
	epochMs?: number;
	error?: string;
} {
	if (!/^-?(0|[1-9]\d*)$/.test(value)) {
		return { error: "Epoch milliseconds must be a base-10 integer." };
	}
	const epochMs = Number(value);
	if (
		!Number.isSafeInteger(epochMs) ||
		epochMs < MIN_DATE_EPOCH_MS ||
		epochMs > MAX_DATE_EPOCH_MS
	) {
		return {
			error:
				"Epoch milliseconds are outside the supported scheduled-time range.",
		};
	}
	return { epochMs };
}

export function formatUtcCalendarValue(epochMs: number): string {
	return new Date(epochMs).toISOString().slice(0, -1);
}

/** Enter custom-time mode, initializing only rows without an existing draft. */
export function enterCustomTimeMode(row: CronRow, now: number): CronRow {
	if (row.calendarValue === undefined && row.epochValue === undefined) {
		return {
			...row,
			calendarValue: formatUtcCalendarValue(now),
			customEpochMs: now,
			epochValue: String(now),
			timeMode: "custom",
		};
	}

	const customEpochMs =
		row.customTimeInputMode === "calendar"
			? (() => {
					const resolution = resolveUtcCalendarTime(row.calendarValue ?? "");
					return resolution.kind === "exact" ? resolution.epochMs : undefined;
				})()
			: parseEpochMilliseconds(row.epochValue ?? "").epochMs;
	return { ...row, customEpochMs, timeMode: "custom" };
}
