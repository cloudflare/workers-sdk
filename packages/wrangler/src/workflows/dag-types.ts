/**
 * DAG (Directed Acyclic Graph) types for workflow visualization.
 *
 * These types match the output from the Rust visualizer-controller
 * so the same UI components can render both local and production diagrams.
 */

export type WorkflowDuration = number | string;

export type BackoffMode = "constant" | "linear" | "exponential";

export type RetryPolicy = {
	limit: number;
	delay: WorkflowDuration;
	backoff: BackoffMode;
};

export type StepConfig = {
	retries: RetryPolicy;
	timeout: WorkflowDuration;
};

export type ParallelKind = "all" | "any" | "all_settled" | "race";

export type BreakKind = "break" | "return";

export type WaitForEventOptions = {
	event_type: string;
	timeout: WorkflowDuration;
};

export type Branch = {
	condition: string | null;
	nodes: DagNode[];
};

export type SwitchBranch = {
	condition: string | null;
	nodes: DagNode[];
};

export type StepSleep = {
	type: "step_sleep";
	name: string;
	duration: WorkflowDuration;
	starts?: number;
	resolves?: number;
};

export type StepDo = {
	type: "step_do";
	name: string;
	config: StepConfig;
	nodes: DagNode[];
	starts?: number;
	resolves?: number;
};

export type StepWaitForEvent = {
	type: "step_wait_for_event";
	name: string;
	options: WaitForEventOptions | null;
	starts?: number;
	resolves?: number;
};

export type StepSleepUntil = {
	type: "step_sleep_until";
	name: string;
	timestamp: string;
	starts?: number;
	resolves?: number;
};

export type LoopNode = {
	type: "loop";
	nodes: DagNode[];
};

export type IfNode = {
	type: "if";
	branches: Branch[];
};

export type SwitchNode = {
	type: "switch";
	discriminant: string;
	branches: SwitchBranch[];
};

export type BlockNode = {
	type: "block";
	nodes: DagNode[];
};

export type TryNode = {
	type: "try";
	try_block: BlockNode | null;
	catch_block: BlockNode | null;
	finally_block: BlockNode | null;
};

export type BreakNode = {
	type: "break";
	kind: BreakKind;
};

export type ParallelNode = {
	type: "parallel";
	kind: ParallelKind;
	nodes: DagNode[];
};

export type FunctionCall = {
	type: "function_call";
	name: string;
	starts?: number;
	resolves?: number;
};

export type FunctionDef = {
	type: "function_def";
	name: string;
	nodes: DagNode[];
};

export type DagNode =
	| StepSleep
	| StepDo
	| StepWaitForEvent
	| StepSleepUntil
	| LoopNode
	| ParallelNode
	| TryNode
	| BlockNode
	| IfNode
	| SwitchNode
	| FunctionCall
	| FunctionDef
	| BreakNode;

export type WorkflowEntrypointDag = {
	class_name: string;
	functions: Record<string, FunctionDef>;
	nodes: DagNode[];
};

export type DagPayload = {
	version: number;
	workflow: WorkflowEntrypointDag;
};
