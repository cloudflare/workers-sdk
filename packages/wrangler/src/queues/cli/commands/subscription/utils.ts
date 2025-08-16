import { EventSourceType } from "../../../subscription-types";
import type { EventSource } from "../../../subscription-types";

export function getSourceType(source: EventSource): string {
	return source.type;
}

export function getSourceResource(source: EventSource): string {
	switch (source.type) {
		case EventSourceType.WORKERS_AI_MODEL:
			return source.model_name;
		case EventSourceType.WORKERS_BUILDS_WORKER:
			return source.worker_name;
		case EventSourceType.WORKFLOWS_WORKFLOW:
			return source.workflow_name;
		default:
			return "";
	}
}
