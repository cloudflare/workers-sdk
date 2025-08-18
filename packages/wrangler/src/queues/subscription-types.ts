export interface EventSubscription {
	id: string;
	created_at: string;
	modified_at: string;
	name: string;
	enabled: boolean;
	source: EventSource;
	destination: EventDestination;
	events: string[];
}

export interface EventDestination {
	type: "queues.queue";
	queue_id: string;
}

export enum EventSourceType {
	KV = "kv",
	R2 = "r2",
	SUPER_SLURPER = "superSlurper",
	VECTORIZE = "vectorize",
	WORKERS_AI_MODEL = "workersAi.model",
	WORKERS_BUILDS_WORKER = "workersBuilds.worker",
	WORKFLOWS_WORKFLOW = "workflows.workflow",
}

export const EVENT_SOURCE_TYPES = Object.values(EventSourceType);

export type EventSource =
	| KvEventSource
	| R2EventSource
	| SuperSlurperEventSource
	| VectorizeEventSource
	| WorkersAiModelEventSource
	| WorkersBuildsWorkerEventSource
	| WorkflowsWorkflowEventSource;

export interface KvEventSource {
	type: EventSourceType.KV;
}

export interface R2EventSource {
	type: EventSourceType.R2;
}

export interface SuperSlurperEventSource {
	type: EventSourceType.SUPER_SLURPER;
}

export interface VectorizeEventSource {
	type: EventSourceType.VECTORIZE;
}

export interface WorkersAiModelEventSource {
	type: EventSourceType.WORKERS_AI_MODEL;
	model_name: string;
}

export interface WorkersBuildsWorkerEventSource {
	type: EventSourceType.WORKERS_BUILDS_WORKER;
	worker_name: string;
}

export interface WorkflowsWorkflowEventSource {
	type: EventSourceType.WORKFLOWS_WORKFLOW;
	workflow_name: string;
}

export interface CreateEventSubscriptionRequest {
	name: string;
	enabled: boolean;
	source: EventSource;
	destination: EventDestination;
	events: string[];
}

export interface ListEventSubscriptionsResponse {
	result: EventSubscription[];
	result_info: {
		count: number;
		total_count: number;
		page: number;
		per_page: number;
		total_pages: number;
	};
}
