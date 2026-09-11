export type CronRowSource = "configured" | "custom" | "no-longer-configured";

export type CronInputMode = "expression" | "builder";
export type CronWeekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export type CronBuilderDraft =
	| { kind: "minute-interval"; every: string }
	| { kind: "hour-interval"; every: string; minute: string }
	| {
			kind: "day-of-month-interval";
			every: string;
			hour: string;
			minute: string;
	  }
	| {
			kind: "month-interval";
			every: string;
			dayOfMonth: string;
			hour: string;
			minute: string;
	  }
	| { kind: "daily"; hour: string; minute: string }
	| {
			kind: "weekdays";
			weekdays: CronWeekday[];
			hour: string;
			minute: string;
	  }
	| { kind: "monthly"; dayOfMonth: string; hour: string; minute: string }
	| { kind: "last-day-of-month"; hour: string; minute: string }
	| { kind: "last-weekday-of-month"; hour: string; minute: string }
	| {
			kind: "nearest-weekday";
			dayOfMonth: string;
			hour: string;
			minute: string;
	  }
	| {
			kind: "last-named-weekday";
			weekday: CronWeekday;
			hour: string;
			minute: string;
	  }
	| {
			kind: "nth-weekday";
			weekday: CronWeekday;
			occurrence: string;
			hour: string;
			minute: string;
	  };

export type TimeMode = "now" | "custom";
export type CustomTimeInputMode = "calendar" | "epoch";
export type InvocationStatus = "pending" | "result" | "error";

export interface FetcherScheduledResult {
	outcome: string;
	noRetry: boolean;
	[key: string]: unknown;
}

export interface InvocationSnapshot {
	requestId: string;
	cron: string;
	scheduledTime: number;
	status: InvocationStatus;
	result?: FetcherScheduledResult;
	error?: string;
}

export interface CronRow {
	id: string;
	source: CronRowSource;
	cron: string;
	cronInputMode: CronInputMode;
	cronBuilder: CronBuilderDraft;
	builderApplied?: boolean;
	timeMode: TimeMode;
	customTimeInputMode: CustomTimeInputMode;
	customEpochMs?: number;
	epochValue?: string;
	calendarValue?: string;
	invocation?: InvocationSnapshot;
}

export interface CronWorkerState {
	authoritative: boolean;
	crons?: string[];
	rows: CronRow[];
	stale: boolean;
}
