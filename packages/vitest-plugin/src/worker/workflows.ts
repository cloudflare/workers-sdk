import {
	WorkflowInstanceIntrospectorHandle,
	WorkflowIntrospectorHandle,
} from "@cloudflare/workflows-shared/src/introspection";
import type { ConcurrencyKeysAdmin } from "@cloudflare/workflows-shared/src/concurrency";
import type {
	WorkflowBinding,
	WorkflowConcurrencyKeysAdmin,
	WorkflowInstanceIntrospector,
	WorkflowIntrospector,
} from "@cloudflare/workflows-shared/src/types";

/**
 * Throws a helpful error if `workflow` can't be introspected, such as a
 * Workflow on `ctx.exports`, which only has the public Workflow API.
 *
 * @param workflow - The Workflow passed to an introspection function
 * @param method - The introspection method the function needs
 * @param functionName - The name of the introspection function
 */
function assertIntrospectable(
	workflow: WorkflowBinding,
	method: "unsafeStartIntrospection" | "unsafeGetInstanceModifier",
	functionName: string
): void {
	if (typeof workflow[method] !== "function") {
		throw new Error(
			`[WorkflowIntrospector] \`${functionName}()\` needs a Workflow binding from \`env\`, and can't introspect Workflows on \`ctx.exports\`. ` +
				"To introspect a Workflow declared in `exports`, add a binding to it, for example a test-only binding in your Vitest config: " +
				'`miniflare: { workflows: { MY_WORKFLOW: { name: "my-workflow", className: "MyWorkflow" } } }`. ' +
				"Instances created through `ctx.exports` are introspected too."
		);
	}
}

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
	assertIntrospectable(
		workflow,
		"unsafeGetInstanceModifier",
		"introspectWorkflowInstance"
	);
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
	assertIntrospectable(
		workflow,
		"unsafeStartIntrospection",
		"introspectWorkflow"
	);

	const introspector = new WorkflowIntrospectorHandle(workflow);
	await introspector.start();
	return introspector;
}

type ConcurrencyKeysAdminStub = Rpc.Stub<ConcurrencyKeysAdmin> & Disposable;

// Every Workflow of a test session shares the same keys, so any Workflow binding reaches
// them. The factory stays sync so `using` works, and each method awaits the admin stub.
export function adminWorkflowConcurrencyKeys(
	workflow: WorkflowBinding
): WorkflowConcurrencyKeysAdmin {
	if (typeof workflow?.unsafeGetConcurrencyKeysAdmin !== "function") {
		throw new TypeError(
			"Failed to execute 'adminWorkflowConcurrencyKeys': parameter 1 is not a Workflow binding from `env`."
		);
	}
	const admin =
		workflow.unsafeGetConcurrencyKeysAdmin() as Promise<ConcurrencyKeysAdminStub>;
	void admin.catch(() => {}); // surfaced by the first method call instead
	return {
		list: async () => (await admin).list(),
		get: async (name) => (await admin).get(name),
		set: async (name, limit) => (await admin).set(name, limit),
		delete: async (name) => (await admin).delete(name),
		hold: async (name, count = 1) => {
			const holderIds = await (await admin).hold(name, count);
			return { release: async () => (await admin).release(holderIds) };
		},
		waitForWaiters: async (name, count = 1, options) =>
			(await admin).waitForWaiters(name, count, options?.timeout),
		reset: async () => (await admin).reset(),
		[Symbol.dispose]: () => {
			void admin.then((stub) => stub[Symbol.dispose]()).catch(() => {});
		},
	};
}
