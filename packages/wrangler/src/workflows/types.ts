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
	| "complete";

export type InstanceWithoutDates = {
	status: InstanceStatus;
	instanceId: string;
	versionId: string;
	workflowId: string;
};

export type Instance = {
	id: string;
	created_on: string;
	modified_on: string;
	workflow_id: string;
	version_id: string;
	status: InstanceStatus;
};
