import { isCronBuilderDraft } from "./cron-builder";
import { createCronRow } from "./row-state";
import {
	MAX_DATE_EPOCH_MS,
	MIN_DATE_EPOCH_MS,
	parseEpochMilliseconds,
	resolveUtcCalendarTime,
} from "./scheduled-time";
import type { CustomCronRow } from "./types";

export const CRON_CUSTOM_ROWS_STORAGE_PREFIX =
	"local-explorer.cron-triggers.custom-rows.v1";
export const CRON_TIME_PRESETS_STORAGE_PREFIX =
	"local-explorer.cron-triggers.time-presets.v1";

type PersistedCustomRow = Pick<
	CustomCronRow,
	| "calendarValue"
	| "cron"
	| "cronBuilder"
	| "cronInputMode"
	| "customTimeInputMode"
	| "epochValue"
	| "timeMode"
>;

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
	if (!isCronBuilderDraft(value.cronBuilder)) {
		return undefined;
	}
	return {
		...(value.calendarValue === undefined
			? {}
			: { calendarValue: value.calendarValue }),
		cron: value.cron,
		cronBuilder: value.cronBuilder,
		cronInputMode: value.cronInputMode,
		customTimeInputMode: value.customTimeInputMode,
		...(value.epochValue === undefined ? {} : { epochValue: value.epochValue }),
		timeMode: value.timeMode,
	};
}

function remove(storage: Storage, key: string): boolean {
	try {
		storage.removeItem(key);
		return true;
	} catch {
		// Storage can be unavailable in privacy modes or restricted frames.
		return false;
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

function hydrateRow(draft: PersistedCustomRow): CustomCronRow {
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
): CustomCronRow[] {
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
	if (
		!drafts.every((draft): draft is PersistedCustomRow => draft !== undefined)
	) {
		remove(storage, key);
		return [];
	}
	return drafts.map(hydrateRow);
}

function persistedDraft(row: CustomCronRow): PersistedCustomRow {
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

/** Persist editable custom-row drafts, returning whether storage was updated. */
export function writePersistedCustomCronRows(
	storage: Storage,
	key: string,
	rows: CustomCronRow[]
): boolean {
	if (rows.length === 0) {
		return remove(storage, key);
	}
	const raw = JSON.stringify(rows.map(persistedDraft));
	try {
		storage.setItem(key, raw);
		return true;
	} catch {
		// Quota, privacy, and security errors must not break the editor.
		return false;
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

/** Persist scheduled-time presets, returning whether storage was updated. */
export function writePersistedCronTimePresets(
	storage: Storage,
	key: string,
	presets: number[]
): boolean {
	if (presets.length === 0) {
		return remove(storage, key);
	}
	try {
		storage.setItem(key, JSON.stringify(presets));
		return true;
	} catch {
		// Quota, privacy, and security errors must not break the editor.
		return false;
	}
}
