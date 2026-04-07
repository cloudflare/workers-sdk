export type BackoffMode = "constant" | "linear" | "exponential";

export type WorkflowDuration = number | string;

export type RetryPolicy = {
	limit: number;
	delay: WorkflowDuration;
	backoff: BackoffMode;
};

export type StepDOConfig = {
	retries: RetryPolicy;
	timeout: WorkflowDuration;
};

export type WaitForEventOptions = {
	event_type: string;
	timeout: WorkflowDuration;
};

// Step Nodes
export interface StepDO {
	type: "step_do";
	name: string;
	config: StepDOConfig;
	nodes: Node[];
	starts?: number;
	resolves?: number;
}

export interface StepSleep {
	type: "step_sleep";
	name: string;
	duration: WorkflowDuration;
	starts?: number;
	resolves?: number;
}

export interface StepSleepUntil {
	type: "step_sleep_until";
	name: string;
	timestamp: string;
	starts?: number;
	resolves?: number;
}

export interface StepWaitForEvent {
	type: "step_wait_for_event";
	name: string;
	options: WaitForEventOptions | null;
	starts?: number;
	resolves?: number;
}

export interface BaseBranch {
	nodes: Node[];
}

export interface ConditionalBranch extends BaseBranch {
	condition: string | null;
}

// Control Flow Nodes
export interface IfNode {
	type: "if";
	branches: ConditionalBranch[];
}

export interface SwitchNode {
	type: "switch";
	discriminant: string;
	branches: ConditionalBranch[];
}

export interface BreakNode {
	type: "break";
	kind?: "break" | "return";
}

export interface LoopNode {
	type: "loop";
	nodes: Node[];
}

export interface ParallelNode {
	type: "parallel";
	kind: "all_settled" | "any" | "all" | "race";
	nodes: Node[];
}

export interface TryNode {
	type: "try";
	try_block: { nodes: Node[] } | null;
	catch_block: { nodes: Node[] } | null;
	finally_block: { nodes: Node[] } | null;
}

// Function Types
export interface FunctionCall {
	type: "function_call";
	name: string;
	nodes?: Node[];
	starts?: number;
	resolves?: number;
}

export type FunctionDef = {
	type?: "function_def";
	name: string;
	nodes: Node[];
};

export type StepNode = StepDO | StepSleep | StepSleepUntil | StepWaitForEvent;
export type ControlFlowNode =
	| IfNode
	| SwitchNode
	| LoopNode
	| ParallelNode
	| TryNode
	| FunctionCall
	| BreakNode;

// Node Union
export type Node = StepNode | ControlFlowNode;

// Top-Level Types
export type WorkflowEntrypoint = {
	class_name: string;
	functions: Record<string, FunctionDef>;
	nodes: Node[];
};

export type DagPayload = {
	version: number;
	workflow: WorkflowEntrypoint;
};
