import { UserError } from "../errors";
import type { InstanceStatus, InstanceTriggerName } from "./types";

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
		default:
			throw new UserError(
				`Looks like you have provided a invalid status "${status}". Valid statuses are: queued, running, paused, errored, terminated, complete`
			);
	}
};
