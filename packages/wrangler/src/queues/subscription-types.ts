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

export type EventSource =
	| KvEventSource
	| R2EventSource
	| SuperSlurperEventSource
	| VectorizeEventSource
	| WorkersAiModelEventSource
	| WorkersBuildsWorkerEventSource
	| WorkflowsWorkflowEventSource;

export interface KvEventSource {
	type: "kv";
}

export interface R2EventSource {
	type: "r2";
}

export interface SuperSlurperEventSource {
	type: "superSlurper";
}

export interface VectorizeEventSource {
	type: "vectorize";
}

export interface WorkersAiModelEventSource {
	type: "workersAi.model";
	model_name: string;
}

export interface WorkersBuildsWorkerEventSource {
	type: "workersBuilds.worker";
	worker_name: string;
}

export interface WorkflowsWorkflowEventSource {
	type: "workflows.workflow";
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
