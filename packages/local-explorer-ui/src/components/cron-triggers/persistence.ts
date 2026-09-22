import { createCronRow } from "./row-state";
import {
	MAX_DATE_EPOCH_MS,
	MIN_DATE_EPOCH_MS,
	parseEpochMilliseconds,
	resolveUtcCalendarTime,
} from "./scheduled-time";
import type { CronBuilderDraft, CronRow, CronWeekday } from "./types";

export const CRON_CUSTOM_ROWS_STORAGE_PREFIX =
	"local-explorer.cron-triggers.custom-rows.v1";
export const CRON_TIME_PRESETS_STORAGE_PREFIX =
	"local-explorer.cron-triggers.time-presets.v1";

type PersistedCustomRow = Pick<
	CronRow,
	| "calendarValue"
	| "cron"
	| "cronBuilder"
	| "cronInputMode"
	| "customTimeInputMode"
	| "epochValue"
	| "timeMode"
>;

const WEEKDAYS = new Set<CronWeekday>([
	"sun",
	"mon",
	"tue",
	"wed",
	"thu",
	"fri",
	"sat",
]);

const ROW_KEYS = new Set([
	"calendarValue",
	"cron",
	"cronBuilder",
	"cronInputMode",
	"customTimeInputMode",
	"epochValue",
	"timeMode",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
	value: Record<string, unknown>,
	required: string[],
	optional: string[] = []
): boolean {
	const requiredKeys = new Set(required);
	const allowedKeys = new Set([...required, ...optional]);
	return (
		required.every((key) => key in value) &&
		Object.keys(value).every((key) => allowedKeys.has(key)) &&
		Object.keys(value).length >= requiredKeys.size
	);
}

function stringFields(
	value: Record<string, unknown>,
	fields: string[]
): boolean {
	return fields.every((field) => typeof value[field] === "string");
}

function parseCronBuilderDraft(value: unknown): CronBuilderDraft | undefined {
	if (!isRecord(value) || typeof value.kind !== "string") {
		return undefined;
	}

	let required: string[];
	switch (value.kind) {
		case "minute-interval":
			required = ["kind", "every"];
			break;
		case "hour-interval":
			required = ["kind", "every", "minute"];
			break;
		case "day-of-month-interval":
			required = ["kind", "every", "hour", "minute"];
			break;
		case "month-interval":
			required = ["kind", "every", "dayOfMonth", "hour", "minute"];
			break;
		case "daily":
		case "last-day-of-month":
		case "last-weekday-of-month":
			required = ["kind", "hour", "minute"];
			break;
		case "weekdays":
			required = ["kind", "weekdays", "hour", "minute"];
			if (
				!Array.isArray(value.weekdays) ||
				value.weekdays.length > WEEKDAYS.size ||
				value.weekdays.some(
					(weekday) =>
						typeof weekday !== "string" || !WEEKDAYS.has(weekday as CronWeekday)
				) ||
				new Set(value.weekdays).size !== value.weekdays.length
			) {
				return undefined;
			}
			break;
		case "monthly":
		case "nearest-weekday":
			required = ["kind", "dayOfMonth", "hour", "minute"];
			break;
		case "last-named-weekday":
			required = ["kind", "weekday", "hour", "minute"];
			if (
				typeof value.weekday !== "string" ||
				!WEEKDAYS.has(value.weekday as CronWeekday)
			) {
				return undefined;
			}
			break;
		case "nth-weekday":
			required = ["kind", "weekday", "occurrence", "hour", "minute"];
			if (
				typeof value.weekday !== "string" ||
				!WEEKDAYS.has(value.weekday as CronWeekday)
			) {
				return undefined;
			}
			break;
		default:
			return undefined;
	}

	if (!hasOnlyKeys(value, required)) {
		return undefined;
	}
	const nonStringFields = new Set(["kind", "weekday", "weekdays"]);
	if (
		!stringFields(
			value,
			required.filter((key) => !nonStringFields.has(key))
		)
	) {
		return undefined;
	}
	return value as unknown as CronBuilderDraft;
}

function parsePersistedCustomRow(
	value: unknown
): PersistedCustomRow | undefined {
	if (
		!isRecord(value) ||
		!("cron" in value) ||
		!("cronBuilder" in value) ||
		!("cronInputMode" in value) ||
		!("customTimeInputMode" in value) ||
		!("timeMode" in value) ||
		Object.keys(value).some((key) => !ROW_KEYS.has(key)) ||
		typeof value.cron !== "string" ||
		(value.cronInputMode !== "expression" &&
			value.cronInputMode !== "builder") ||
		(value.customTimeInputMode !== "calendar" &&
			value.customTimeInputMode !== "epoch") ||
		(value.timeMode !== "now" && value.timeMode !== "custom") ||
		(value.calendarValue !== undefined &&
			typeof value.calendarValue !== "string") ||
		(value.epochValue !== undefined && typeof value.epochValue !== "string")
	) {
		return undefined;
	}
	const cronBuilder = parseCronBuilderDraft(value.cronBuilder);
	if (!cronBuilder) {
		return undefined;
	}
	return {
		...(value.calendarValue === undefined
			? {}
			: { calendarValue: value.calendarValue }),
		cron: value.cron,
		cronBuilder,
		cronInputMode: value.cronInputMode,
		customTimeInputMode: value.customTimeInputMode,
		...(value.epochValue === undefined ? {} : { epochValue: value.epochValue }),
		timeMode: value.timeMode,
	};
}

function remove(storage: Storage, key: string): void {
	try {
		storage.removeItem(key);
	} catch {
		// Storage can be unavailable in privacy modes or restricted frames.
	}
}

export function cronCustomRowsStorageKey(
	persistenceScope: string | undefined,
	workerName: string
): string | undefined {
	return persistenceScope
		? `${CRON_CUSTOM_ROWS_STORAGE_PREFIX}.${persistenceScope}.${encodeURIComponent(workerName)}`
		: undefined;
}

export function cronTimePresetsStorageKey(
	persistenceScope: string | undefined,
	workerName: string
): string | undefined {
	return persistenceScope
		? `${CRON_TIME_PRESETS_STORAGE_PREFIX}.${persistenceScope}.${encodeURIComponent(workerName)}`
		: undefined;
}

function hydrateRow(draft: PersistedCustomRow): CronRow {
	let customEpochMs: number | undefined;
	if (draft.timeMode === "custom") {
		if (draft.customTimeInputMode === "calendar") {
			const resolved = resolveUtcCalendarTime(draft.calendarValue ?? "");
			customEpochMs = resolved.kind === "exact" ? resolved.epochMs : undefined;
		} else {
			customEpochMs = parseEpochMilliseconds(draft.epochValue ?? "").epochMs;
		}
	}
	return {
		...createCronRow(draft.cron),
		...draft,
		...(customEpochMs === undefined ? {} : { customEpochMs }),
	};
}

/** Read validated custom drafts and recreate transient row state from scratch. */
export function readPersistedCustomCronRows(
	storage: Storage,
	key: string
): CronRow[] {
	let raw: string | null;
	try {
		raw = storage.getItem(key);
	} catch {
		return [];
	}
	if (raw === null) {
		return [];
	}
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		remove(storage, key);
		return [];
	}
	if (!Array.isArray(value) || value.length === 0) {
		remove(storage, key);
		return [];
	}
	const drafts = value.map(parsePersistedCustomRow);
	if (drafts.some((draft) => draft === undefined)) {
		remove(storage, key);
		return [];
	}
	return (drafts as PersistedCustomRow[]).map(hydrateRow);
}

function persistedDraft(row: CronRow): PersistedCustomRow {
	return {
		...(row.calendarValue === undefined
			? {}
			: { calendarValue: row.calendarValue }),
		cron: row.cron,
		cronBuilder: row.cronBuilder,
		cronInputMode: row.cronInputMode,
		customTimeInputMode: row.customTimeInputMode,
		...(row.epochValue === undefined ? {} : { epochValue: row.epochValue }),
		timeMode: row.timeMode,
	};
}

/** Persist only editable custom-row drafts; transient and configured state is omitted. */
export function writePersistedCustomCronRows(
	storage: Storage,
	key: string,
	rows: CronRow[]
): void {
	const customRows = rows
		.filter((row) => row.source === "custom")
		.map(persistedDraft);
	if (customRows.length === 0) {
		remove(storage, key);
		return;
	}
	const raw = JSON.stringify(customRows);
	try {
		storage.setItem(key, raw);
	} catch {
		// Quota, privacy, and security errors must not break the editor.
	}
}

/** Read validated, worker-scoped scheduled-time presets. */
export function readPersistedCronTimePresets(
	storage: Storage,
	key: string
): number[] {
	let raw: string | null;
	try {
		raw = storage.getItem(key);
	} catch {
		return [];
	}
	if (raw === null) {
		return [];
	}
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		remove(storage, key);
		return [];
	}
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		value.some(
			(preset) =>
				typeof preset !== "number" ||
				!Number.isSafeInteger(preset) ||
				preset < MIN_DATE_EPOCH_MS ||
				preset > MAX_DATE_EPOCH_MS
		) ||
		new Set(value).size !== value.length
	) {
		remove(storage, key);
		return [];
	}
	return value;
}

/** Persist reusable scheduled-time presets without an application-level cap. */
export function writePersistedCronTimePresets(
	storage: Storage,
	key: string,
	presets: number[]
): void {
	if (presets.length === 0) {
		remove(storage, key);
		return;
	}
	try {
		storage.setItem(key, JSON.stringify(presets));
	} catch {
		// Quota, privacy, and security errors must not break the editor.
	}
}
