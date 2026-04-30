import { UserError } from "@cloudflare/workers-utils";
import { fetchResult } from "../cfetch";
import type { Instance, InstanceStatus, InstanceTriggerName } from "./types";
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
	status: "pause" | "resume" | "restart" | "terminate"
): Promise<void> {
	await fetchResult(
		config,
		`/accounts/${accountId}/workflows/${workflowName}/instances/${instanceId}/status`,
		{
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ status }),
		}
	);
}
