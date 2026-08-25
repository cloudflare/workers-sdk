import { UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import type {
	Instance,
	InstanceStatus,
	InstanceTriggerName,
	WorkflowInstanceRestartFrom,
} from "./types";
import type { Config } from "@cloudflare/workers-utils";

export const emojifyInstanceStatus = (status: InstanceStatus) => {
	switch (status) {
		case "complete":
			return "✅ Completed";
		case "errored":
			return "❌ Errored";
		case "unknown":
			return "❓ Unknown";
		case "paused":
			return "⏸️ Paused";
		case "queued":
			return "⌛ Queued";
		case "running":
			return "▶ Running";
		case "terminated":
			return "🚫 Terminated";
		case "waiting":
			return "⏰ Waiting";
		case "waitingForPause":
			return "⏱️ Waiting for Pause";
		default:
			return "❓ Unknown";
	}
};

export const emojifyInstanceTriggerName = (status: InstanceTriggerName) => {
	switch (status) {
		case "api":
			return "🌎 API";
		case "binding":
			return "🔗 Binding";
		case "cron":
			return "⌛ Cron";
		case "event":
			return "📩 Event";
		default:
			return "❓ Unknown";
	}
};

export const emojifyStepType = (type: string) => {
	switch (type) {
		case "step":
			return "🎯 Step";
		case "sleep":
			return "💤 Sleeping";
		case "termination":
			return "🚫 Termination";
		case "waitForEvent":
			return "👀 Waiting for event";
		default:
			return "❓ Unknown";
	}
};

export const validateStatus = (status: string): InstanceStatus => {
	switch (status) {
		case "complete":
			return "complete";
		case "errored":
			return "errored";
		case "paused":
			return "paused";
		case "queued":
			return "queued";
		case "running":
			return "running";
		case "terminated":
			return "terminated";
		case "waiting":
			return "waiting";
		case "waitingForPause":
			return "waitingForPause";
		default:
			throw new UserError(
				`Looks like you have provided a invalid status "${status}". Valid statuses are: queued, running, paused, errored, terminated, complete, waiting, waitingForPause`,
				{ telemetryMessage: "workflows invalid status" }
			);
	}
};

/** Matches the `YYYY-MM-DD` date portion of an ISO 8601 date or timestamp. */
const ISO_DATE_PREFIX_REG_EXP = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/;

/**
 * `Date` rolls `2026-02-30` over to 2026-03-02 instead of failing, so the
 * result is compared back to the input. `Date.UTC` remaps years 0-99.
 */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
	const date = new Date(0);
	date.setUTCFullYear(year, month - 1, day);
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

/**
 * Normalises an ISO 8601 date or timestamp to UTC, the only format the
 * Workflows API accepts. Rejects locale formats such as `January 1, 2026`.
 */
export function validateInstanceDate(value: string, flag: string): string {
	const dateParts = ISO_DATE_PREFIX_REG_EXP.exec(value);
	const parsed = Date.parse(value);

	if (dateParts === null || Number.isNaN(parsed)) {
		throw new UserError(
			`Looks like you have provided an invalid date "${value}" for ${flag}. Provide an ISO 8601 date or timestamp, for example 2026-01-01 or 2026-01-01T13:00:00Z.`,
			{ telemetryMessage: "workflows instances list invalid date" }
		);
	}

	const [, year, month, day] = dateParts;
	if (!isRealCalendarDate(Number(year), Number(month), Number(day))) {
		throw new UserError(
			`The date "${value}" provided for ${flag} is not a real calendar date, so it would filter on a different date than intended. Check the month and day.`,
			{ telemetryMessage: "workflows instances list invalid date" }
		);
	}

	return new Date(parsed).toISOString();
}

export async function getInstanceIdFromArgs(
	accountId: string,
	args: { id: string; name: string },
	config: Config
) {
	let id = args.id;

	if (id == "latest") {
		const instances = (
			await fetchResult<Instance[]>(
				config,
				`/accounts/${accountId}/workflows/${args.name}/instances/`
			)
		).sort((a, b) => b.created_on.localeCompare(a.created_on));

		if (instances.length == 0) {
			throw new UserError(
				`There are no deployed instances in workflow "${args.name}"`,
				{ telemetryMessage: "workflows latest instance missing" }
			);
		}

		id = instances[0].id;
	}
	return id;
}

export async function updateInstanceStatus(
	config: Config,
	accountId: string,
	workflowName: string,
	instanceId: string,
	status: "pause" | "resume" | "restart" | "terminate",
	from?: WorkflowInstanceRestartFrom,
	rollback?: boolean
): Promise<void> {
	const body = {
		status,
		...(from ? { from } : {}),
		...(status === "terminate" && rollback === true ? { rollback: true } : {}),
	};

	await fetchResult(
		config,
		`/accounts/${accountId}/workflows/${workflowName}/instances/${instanceId}/status`,
		{
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		}
	);
}
