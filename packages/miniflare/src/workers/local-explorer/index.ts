import type {
	WorChangeStatusWorkflowInstanceData,
	WorChangeStatusWorkflowInstanceResponses,
} from "./generated";

export type {
	WorChangeStatusWorkflowInstanceData,
	WorChangeStatusWorkflowInstanceResponses,
} from "./generated";

export type LocalExplorerWorkflowInstanceStatus =
	WorChangeStatusWorkflowInstanceData["body"]["status"];

export type LocalExplorerWorkflowInstanceStatusResult =
	WorChangeStatusWorkflowInstanceResponses[200]["result"];
