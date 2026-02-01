export type Workflow = {
	name: string;
	id: string;
	created_on: string;
	modified_on: string;
	script_name: string;
	class_name: string;
};

export type Version = {
	id: string;
	created_on: string;
	modified_on: string;
	workflow_id: string;
};

export type InstanceStatus =
	| "unknown"
	| "queued"
	| "running"
	| "paused"
	| "errored"
	| "terminated"
	| "waiting"
	| "waitingForPause"
	| "complete";

export type InstanceWithoutDates = {
	status: InstanceStatus;
	id: string;
	version_id: string;
	workflow_id: string;
};

export type Instance = {
	id: string;
	created_on: string;
	modified_on: string;
	workflow_id: string;
	version_id: string;
	status: InstanceStatus;
};

export type InstanceTriggerName =
	| "api"
	| "binding"
	| "event"
	| "cron"
	| "unknown";

export type InstanceAttempt = {
	start: string;
	end: string | null;
	success: boolean | null;
	error: { name: string; message: string } | null;
};

export type Backoff = "constant" | "linear" | "exponential";

export type StepConfig = {
	retries: {
		limit: number;
		delay: string | number;
		backoff?: Backoff;
	};
	timeout: string | number;
};

export type InstanceStepLog = {
	name: string;
	start: string;
	end: string | null;
	attempts: InstanceAttempt[];
	output: unknown;
	success: boolean | null;
	config: StepConfig;
	type: "step";
};

export type InstanceSleepLog = {
	name: string;
	start: string;
	end: string;
	finished: boolean;
	type: "sleep";
};

export type InstanceTerminateLog = {
	type: "termination";
	trigger: {
		source: string;
	};
};

export type InstanceWaitForEventLog = {
	name: string;
	start: string;
	end: string;
	finished: boolean;
	error: { name: string; message: string } | null;
	output: unknown;
	type: "waitForEvent";
};

export type InstanceStatusAndLogs = {
	status: InstanceStatus;
	params: Record<string, unknown>;
	trigger: {
		source: InstanceTriggerName;
	};
	versionId: string;
	queued: string;
	start: string | null;
	end: string | null;
	steps: (
		| InstanceStepLog
		| InstanceSleepLog
		| InstanceTerminateLog
		| InstanceWaitForEventLog
	)[];
	success: boolean | null;
	error: { name: string; message: string } | null;
};
