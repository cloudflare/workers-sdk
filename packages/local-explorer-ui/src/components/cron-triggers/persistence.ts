import { isCronBuilderDraft } from "./cron-builder";
import { createCronRow } from "./row-state";
import { MAX_DATE_EPOCH_MS, MIN_DATE_EPOCH_MS } from "./scheduled-time";
import type { CustomCronRow } from "./types";

export const CRON_CUSTOM_ROWS_STORAGE_PREFIX =
	"local-explorer.cron-triggers.custom-rows.v1";
export const CRON_TIME_PRESETS_STORAGE_PREFIX =
	"local-explorer.cron-triggers.time-presets.v1";

type PersistedCustomRow = Pick<
	CustomCronRow,
	"cron" | "cronBuilder" | "cronInputMode"
>;

const ACCEPTED_ROW_KEYS = new Set([
	// Accept fields written by the earlier per-row scheduled-time UI, but do not
	// restore or write them now that scheduled time is selected at page level.
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
		Object.keys(value).some((key) => !ACCEPTED_ROW_KEYS.has(key)) ||
		typeof value.cron !== "string" ||
		(value.cronInputMode !== "expression" && value.cronInputMode !== "builder")
	) {
		return undefined;
	}
	if (!isCronBuilderDraft(value.cronBuilder)) {
		return undefined;
	}
	return {
		cron: value.cron,
		cronBuilder: value.cronBuilder,
		cronInputMode: value.cronInputMode,
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
	return {
		...createCronRow(draft.cron),
		...draft,
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
		cron: row.cron,
		cronBuilder: row.cronBuilder,
		cronInputMode: row.cronInputMode,
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
