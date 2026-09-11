import { createDefaultCronBuilderDraft } from "./cron-builder";
import type { CronRow } from "./types";

let nextRowId = 0;

function rowId(prefix: string): string {
	nextRowId += 1;
	return `${prefix}-${nextRowId}`;
}

function configuredKeys(crons: string[]): string[] {
	const counts = new Map<string, number>();
	return crons.map((cron) => {
		const ordinal = counts.get(cron) ?? 0;
		counts.set(cron, ordinal + 1);
		return `${cron}\u0000${ordinal}`;
	});
}

export function createCronRow(
	cron: string,
	source: CronRow["source"] = "custom"
): CronRow {
	return {
		id: rowId(source),
		source,
		cron,
		cronInputMode: "expression",
		cronBuilder: createDefaultCronBuilderDraft(),
		timeMode: "now",
		customTimeInputMode: "calendar",
	};
}

/** Merge configured rows by exact expression plus duplicate occurrence ordinal. */
export function reconcileConfiguredRows(
	rows: CronRow[],
	crons: string[]
): CronRow[] {
	const oldConfigured = rows.filter((row) => row.source === "configured");
	const oldKeys = configuredKeys(oldConfigured.map((row) => row.cron));
	const oldByKey = new Map<string, CronRow>();
	oldKeys.forEach((key, index) => {
		const row = oldConfigured[index];
		if (row) {
			oldByKey.set(key, row);
		}
	});
	const nextKeys = configuredKeys(crons);
	const retainedIds = new Set<string>();
	const configured = crons.map((cron, index) => {
		const key = nextKeys[index];
		const existing = key === undefined ? undefined : oldByKey.get(key);
		if (existing) {
			retainedIds.add(existing.id);
			return existing;
		}
		return createCronRow(cron, "configured");
	});
	const staleSettled = oldConfigured
		.filter((row) => !retainedIds.has(row.id) && row.invocation !== undefined)
		.map((row) => ({ ...row, source: "no-longer-configured" as const }));
	const local = rows.filter((row) => row.source !== "configured");
	return [...configured, ...local, ...staleSettled];
}

export function duplicateCronRow(row: CronRow): CronRow {
	return {
		...row,
		id: rowId("custom"),
		source: "custom",
		cronBuilder: structuredClone(row.cronBuilder),
		invocation: undefined,
	};
}

export function rowIsPending(row: CronRow): boolean {
	return row.invocation?.status === "pending";
}
