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
