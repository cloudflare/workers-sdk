import type { EventSource } from "../../../subscription-types";

export function getSourceType(source: EventSource): string {
	return source.type;
}

export function getSourceResource(source: EventSource): string {
	switch (source.type) {
		case "workersAi.model":
			return source.model_name;
		case "workersBuilds.worker":
			return source.worker_name;
		case "workflows.workflow":
			return source.workflow_name;
		default:
			return "";
	}
}