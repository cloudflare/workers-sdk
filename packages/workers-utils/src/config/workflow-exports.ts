import { partitionExports } from "./exports";
import type { Config } from "./config";
import type { WorkflowExport } from "./environment";

/** Returns the Workflow entries from a declarative exports map. */
export function getWorkflowExports(
	exports: Config["exports"] | undefined
): Record<string, WorkflowExport> {
	return partitionExports(exports).workflow;
}

export function hasWorkflowExports(
	exports: Config["exports"] | undefined
): boolean {
	return Object.keys(getWorkflowExports(exports)).length > 0;
}
