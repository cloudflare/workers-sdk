export interface StepData {
	name?: string;
	type?: string;
	start?: string;
	end?: string;
	success?: boolean | null;
	finished?: boolean;
	output?: unknown;
	error?: { name?: string; message?: string } | null;
	config?: Record<string, unknown> | null;
	attempts?: AttemptData[];
}

export interface AttemptData {
	start?: string;
	end?: string;
	success?: boolean | null;
	error?: { name?: string; message?: string } | null;
}

export interface InstanceDetails {
	status?: string;
	params?: unknown;
	queued?: string;
	start?: string;
	end?: string;
	output?: unknown;
	error?: { name?: string; message?: string } | null;
	steps?: StepData[];
	step_count?: number;
}

export type Action = "pause" | "resume" | "restart" | "terminate";

export interface RestartFromStepParam {
	name: string;
	count?: number;
	type?: "do" | "sleep" | "waitForEvent";
}

/**
 * Convert a step row's data into the `from` payload accepted by the
 * change-instance-status API when restarting from a specific step.
 *
 * The runtime stores step names as `name-N`, where `N` is a 1-based counter
 * disambiguating multiple steps that share the same logical name. The API
 * expects the logical name + the counter as separate fields.
 */
export function getRestartFromStepParam(step: StepData): RestartFromStepParam {
	const rawName = step.name ?? "";
	const suffixMatch = rawName.match(/-(\d+)$/);
	const name = suffixMatch ? rawName.slice(0, -suffixMatch[0].length) : rawName;
	const count = suffixMatch ? Number(suffixMatch[1]) : undefined;

	// Local step types use "step" while the API expects "do" for the same concept.
	let type: RestartFromStepParam["type"] | undefined;
	if (step.type === "step") {
		type = "do";
	} else if (step.type === "sleep" || step.type === "waitForEvent") {
		type = step.type;
	}

	return {
		name,
		...(count !== undefined ? { count } : {}),
		...(type !== undefined ? { type } : {}),
	};
}

const TERMINAL_STATUSES = new Set(["complete", "errored", "terminated"]);

export function getAvailableActions(status: string): Action[] {
	const actions: Action[] = [];
	if (status === "running" || status === "waiting") {
		actions.push("pause");
	}
	if (status === "paused" || status === "waitingForPause") {
		actions.push("resume");
	}
	if (!TERMINAL_STATUSES.has(status)) {
		actions.push("terminate");
	}
	actions.push("restart");
	return actions;
}

export function isTerminalStatus(status: string): boolean {
	return TERMINAL_STATUSES.has(status);
}
