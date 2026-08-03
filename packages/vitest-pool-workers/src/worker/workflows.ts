import {
	WorkflowInstanceIntrospectorHandle,
	WorkflowIntrospectorHandle,
} from "@cloudflare/workflows-shared/src/introspection";
import type {
	WorkflowBinding,
	WorkflowInstanceIntrospector,
	WorkflowIntrospector,
} from "@cloudflare/workflows-shared/src/types";

// Note(osilva): `introspectWorkflowInstance()` doesn’t need to be async, but we keep it that way
// to avoid potential breaking changes later and to stay consistent with `introspectWorkflow`.

// In the "cloudflare:test" module, the exposed type is `Workflow`. Here we use `WorkflowBinding`
// (which implements `Workflow`) to access unsafe functions.
export async function introspectWorkflowInstance(
	workflow: WorkflowBinding,
	instanceId: string
): Promise<WorkflowInstanceIntrospector> {
	if (!workflow || !instanceId) {
		throw new Error(
			"[WorkflowIntrospector] Workflow binding and instance id are required."
		);
	}
	return new WorkflowInstanceIntrospectorHandle(workflow, instanceId);
}

// Note(osilva): `introspectWorkflow` could be sync with some changes, but we keep it async
// to avoid potential breaking changes later.

// In the "cloudflare:test" module, the exposed type is `Workflow`. Here we use `WorkflowBinding`
// (which implements `Workflow`) to access unsafe functions.
export async function introspectWorkflow(
	workflow: WorkflowBinding
): Promise<WorkflowIntrospector> {
	if (!workflow) {
		throw new Error("[WorkflowIntrospector] Workflow binding is required.");
	}

	const introspector = new WorkflowIntrospectorHandle(workflow);
	await introspector.start();
	return introspector;
}
