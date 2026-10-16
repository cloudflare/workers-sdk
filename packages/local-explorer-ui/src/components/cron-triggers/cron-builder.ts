import type { CronBuilderDraft, CronWeekday } from "./types";

const WEEKDAYS: CronWeekday[] = [
	"sun",
	"mon",
	"tue",
	"wed",
	"thu",
	"fri",
	"sat",
];

export interface CronBuilderResult {
	expression?: string;
	errors: Record<string, string>;
}

function integer(
	value: string,
	minimum: number,
	maximum: number,
	label: string
): { error?: string; value?: number } {
	if (!/^\d+$/.test(value)) {
		return { error: `${label} must be a whole number.` };
	}
	const parsed = Number(value);
	if (parsed < minimum || parsed > maximum) {
		return { error: `${label} must be between ${minimum} and ${maximum}.` };
	}
	return { value: parsed };
}

function field(
	errors: Record<string, string>,
	name: string,
	value: string,
	minimum: number,
	maximum: number,
	label: string
): string {
	const result = integer(value, minimum, maximum, label);
	if (result.error) {
		errors[name] = result.error;
	}
	return result.value === undefined ? value : String(result.value);
}

export function createDefaultCronBuilderDraft(): CronBuilderDraft {
	return { kind: "daily", hour: "0", minute: "0" };
}

/** Generate the exact five-field expression represented by a builder draft. */
export function generateCronExpression(
	draft: CronBuilderDraft
): CronBuilderResult {
	const errors: Record<string, string> = {};
	const minute =
		"minute" in draft
			? field(errors, "minute", draft.minute, 0, 59, "Minute")
			: undefined;
	const hour =
		"hour" in draft
			? field(errors, "hour", draft.hour, 0, 23, "Hour")
			: undefined;
	let expression: string;

	switch (draft.kind) {
		case "minute-interval": {
			const every = field(
				errors,
				"every",
				draft.every,
				1,
				59,
				"Minute interval"
			);
			expression = `*/${every} * * * *`;
			break;
		}
		case "hour-interval": {
			const every = field(errors, "every", draft.every, 1, 23, "Hour interval");
			expression = `${minute} */${every} * * *`;
			break;
		}
		case "day-of-month-interval": {
			const every = field(errors, "every", draft.every, 1, 31, "Day interval");
			expression = `${minute} ${hour} */${every} * *`;
			break;
		}
		case "month-interval": {
			const every = field(
				errors,
				"every",
				draft.every,
				1,
				12,
				"Month interval"
			);
			const day = field(
				errors,
				"dayOfMonth",
				draft.dayOfMonth,
				1,
				31,
				"Day of month"
			);
			expression = `${minute} ${hour} ${day} */${every} *`;
			break;
		}
		case "daily":
			expression = `${minute} ${hour} * * *`;
			break;
		case "weekdays": {
			const selected = WEEKDAYS.filter((weekday) =>
				draft.weekdays.includes(weekday)
			);
			if (selected.length === 0) {
				errors.weekdays = "Select at least one weekday.";
			}
			expression = `${minute} ${hour} * * ${selected.join(",")}`;
			break;
		}
		case "monthly": {
			const day = field(
				errors,
				"dayOfMonth",
				draft.dayOfMonth,
				1,
				31,
				"Day of month"
			);
			expression = `${minute} ${hour} ${day} * *`;
			break;
		}
		case "last-day-of-month":
			expression = `${minute} ${hour} L * *`;
			break;
		case "last-weekday-of-month":
			expression = `${minute} ${hour} LW * *`;
			break;
		case "nearest-weekday": {
			const day = field(
				errors,
				"dayOfMonth",
				draft.dayOfMonth,
				1,
				31,
				"Day of month"
			);
			expression = `${minute} ${hour} ${day}W * *`;
			break;
		}
		case "last-named-weekday":
			expression = `${minute} ${hour} * * ${draft.weekday}L`;
			break;
		case "nth-weekday": {
			const occurrence = field(
				errors,
				"occurrence",
				draft.occurrence,
				1,
				5,
				"Weekday occurrence"
			);
			expression = `${minute} ${hour} * * ${draft.weekday}#${occurrence}`;
			break;
		}
	}

	return Object.keys(errors).length === 0 ? { expression, errors } : { errors };
}

export const cronBuilderKinds: Array<{
	label: string;
	value: CronBuilderDraft["kind"];
}> = [
	{ label: "Every N minutes", value: "minute-interval" },
	{ label: "Every N hours", value: "hour-interval" },
	{ label: "Every N days of the month", value: "day-of-month-interval" },
	{ label: "Every N months", value: "month-interval" },
	{ label: "Every day", value: "daily" },
	{ label: "Selected weekdays", value: "weekdays" },
	{ label: "Day of each month", value: "monthly" },
	{ label: "Last day of each month", value: "last-day-of-month" },
	{ label: "Nearest weekday", value: "nearest-weekday" },
	{ label: "Last weekday of each month", value: "last-weekday-of-month" },
	{ label: "Last selected weekday", value: "last-named-weekday" },
	{ label: "Nth selected weekday", value: "nth-weekday" },
];

export function changeCronBuilderKind(
	kind: CronBuilderDraft["kind"]
): CronBuilderDraft {
	switch (kind) {
		case "minute-interval":
			return { kind, every: "5" };
		case "hour-interval":
			return { kind, every: "1", minute: "0" };
		case "day-of-month-interval":
			return { kind, every: "1", hour: "0", minute: "0" };
		case "month-interval":
			return {
				kind,
				every: "1",
				dayOfMonth: "1",
				hour: "0",
				minute: "0",
			};
		case "daily":
			return { kind, hour: "0", minute: "0" };
		case "weekdays":
			return { kind, weekdays: ["mon"], hour: "0", minute: "0" };
		case "monthly":
		case "nearest-weekday":
			return { kind, dayOfMonth: "1", hour: "0", minute: "0" };
		case "last-day-of-month":
		case "last-weekday-of-month":
			return { kind, hour: "0", minute: "0" };
		case "last-named-weekday":
			return { kind, weekday: "fri", hour: "0", minute: "0" };
		case "nth-weekday":
			return {
				kind,
				weekday: "mon",
				occurrence: "1",
				hour: "0",
				minute: "0",
			};
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCronBuilderKind(value: unknown): value is CronBuilderDraft["kind"] {
	return (
		typeof value === "string" &&
		cronBuilderKinds.some((kind) => kind.value === value)
	);
}

function isCronWeekday(value: unknown): value is CronWeekday {
	return (
		typeof value === "string" && WEEKDAYS.some((weekday) => weekday === value)
	);
}

/** Validate persisted builder state against the shapes used by the editor. */
export function isCronBuilderDraft(value: unknown): value is CronBuilderDraft {
	if (!isRecord(value) || !isCronBuilderKind(value.kind)) {
		return false;
	}

	const template: Record<string, unknown> = changeCronBuilderKind(value.kind);
	const expectedKeys = Object.keys(template);
	const actualKeys = Object.keys(value);
	if (
		actualKeys.length !== expectedKeys.length ||
		expectedKeys.some((key) => !actualKeys.includes(key))
	) {
		return false;
	}

	return expectedKeys.every((key) => {
		const fieldValue = value[key];
		if (key === "weekdays") {
			return (
				Array.isArray(fieldValue) &&
				fieldValue.length <= WEEKDAYS.length &&
				fieldValue.every(isCronWeekday) &&
				new Set(fieldValue).size === fieldValue.length
			);
		}
		if (key === "weekday") {
			return isCronWeekday(fieldValue);
		}
		return typeof fieldValue === typeof template[key];
	});
}

export { WEEKDAYS as cronWeekdays };
