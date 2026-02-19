import {
	instanceStatusName,
	InstanceStatus as InstanceStatusNumber,
} from "@cloudflare/workflows-shared/src/instance";
import { env } from "cloudflare:workers";
import { runInRunnerObject } from "./durable-objects";
import type { WorkflowBinding } from "@cloudflare/workflows-shared/src/binding";
import type {
	StepSelector,
	WorkflowInstanceModifier,
} from "@cloudflare/workflows-shared/src/modifier";

type ModifierCallback = (m: WorkflowInstanceModifier) => Promise<void>;

// See public facing `cloudflare:test` types for docs
export interface WorkflowInstanceIntrospector {
	modify(fn: ModifierCallback): Promise<WorkflowInstanceIntrospector>;

	waitForStepResult(step: StepSelector): Promise<unknown>;

	waitForStatus(status: string): Promise<void>;

	dispose(): Promise<void>;
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
	return new WorkflowInstanceIntrospectorHandle(workflow, instanceId);
}

class WorkflowInstanceIntrospectorHandle
	implements WorkflowInstanceIntrospector
{
	#workflow: WorkflowBinding;
	#instanceId: string;
	#instanceModifier: WorkflowInstanceModifier | undefined;
	#instanceModifierPromise: Promise<WorkflowInstanceModifier> | undefined;

	constructor(workflow: WorkflowBinding, instanceId: string) {
		this.#workflow = workflow;
		this.#instanceId = instanceId;
		this.#instanceModifierPromise = workflow
			.unsafeGetInstanceModifier(instanceId)
			.then((res) => {
				this.#instanceModifier = res as WorkflowInstanceModifier;
				this.#instanceModifierPromise = undefined;
				return this.#instanceModifier;
			});
	}

	async modify(fn: ModifierCallback): Promise<WorkflowInstanceIntrospector> {
		if (this.#instanceModifierPromise !== undefined) {
			this.#instanceModifier = await this.#instanceModifierPromise;
		}
		if (this.#instanceModifier === undefined) {
			throw new Error(
				"could not apply modifications due to internal error. Retrying the test may resolve the issue."
			);
		}

		await fn(this.#instanceModifier);

		return this;
	}

	async waitForStepResult(step: StepSelector): Promise<unknown> {
		const stepResult = await this.#workflow.unsafeWaitForStepResult(
			this.#instanceId,
			step.name,
			step.index
		);

		return stepResult;
	}

	async waitForStatus(status: InstanceStatus["status"]): Promise<void> {
		if (
			status === instanceStatusName(InstanceStatusNumber.Terminated) ||
			status === instanceStatusName(InstanceStatusNumber.Paused)
		) {
			throw new Error(
				`[WorkflowIntrospector] InstanceStatus '${status}' is not implemented yet and cannot be waited.`
			);
		}

		if (status === instanceStatusName(InstanceStatusNumber.Queued)) {
			// we currently don't have a queue mechanism, but it would happen before it
			// starts running, so waiting for it to be queued should always return
			return;
		}
		await this.#workflow.unsafeWaitForStatus(this.#instanceId, status);
	}

	async getOutput(): Promise<unknown> {
		return await this.#workflow.unsafeGetOutputOrError(this.#instanceId, true);
	}

	async getError(): Promise<{ name: string; message: string }> {
		return (await this.#workflow.unsafeGetOutputOrError(
			this.#instanceId,
			false
		)) as { name: string; message: string };
	}

	async dispose(): Promise<void> {
		await this.#workflow.unsafeAbort(this.#instanceId, "Instance dispose");
	}

	async [Symbol.asyncDispose](): Promise<void> {
		await this.dispose();
	}
}

// See public facing `cloudflare:test` types for docs
export interface WorkflowIntrospector {
	modifyAll(fn: ModifierCallback): Promise<void>;

	get(): WorkflowInstanceIntrospector[];

	dispose(): Promise<void>;
}

// Note(osilva): `introspectWorkflow` could be sync with some changes, but we keep it async
// to avoid potential breaking changes later.

// In the "cloudflare:test" module, the exposed type is `Workflow`. Here we use `WorkflowBinding`
// (which implements `Workflow`) to access unsafe functions.
export async function introspectWorkflow(
	workflow: WorkflowBinding
): Promise<WorkflowIntrospectorHandle> {
	if (!workflow) {
		throw new Error("[WorkflowIntrospector] Workflow binding is required.");
	}

	const modifierCallbacks: ModifierCallback[] = [];
	const instanceIntrospectors: WorkflowInstanceIntrospector[] = [];

	const bindingName = await workflow.unsafeGetBindingName();
	const originalWorkflow = env[bindingName] as Workflow;

	const introspectAndModifyInstance = async (instanceId: string) => {
		try {
			await runInRunnerObject(async () => {
				const introspector = await introspectWorkflowInstance(
					workflow,
					instanceId
				);
				instanceIntrospectors.push(introspector);
				// Apply any stored modifier functions
				for (const callback of modifierCallbacks) {
					await introspector.modify(callback);
				}
			});
		} catch (error) {
			console.error(
				`[WorkflowIntrospector] Error during introspection for instance ${instanceId}:`,
				error
			);
			throw new Error(
				`[WorkflowIntrospector] Failed to introspect Workflow instance ${instanceId}.`
			);
		}
	};

	const createWorkflowProxyGetHandler = <
		T extends Workflow,
	>(): ProxyHandler<T>["get"] => {
		return (target, property) => {
			if (property === "create") {
				return new Proxy(target[property], {
					async apply(func, thisArg, argArray) {
						const hasId = Object.hasOwn(argArray[0] ?? {}, "id");
						if (!hasId) {
							argArray = [{ id: crypto.randomUUID(), ...(argArray[0] ?? {}) }];
						}
						const instanceId = (argArray[0] as { id: string }).id;

						await introspectAndModifyInstance(instanceId);

						return target[property](...argArray);
					},
				});
			}

			if (property === "createBatch") {
				return new Proxy(target[property], {
					async apply(func, thisArg, argArray) {
						for (const [index, arg] of argArray[0]?.entries() ?? []) {
							const hasId = Object.hasOwn(arg, "id");
							if (!hasId) {
								argArray[0][index] = { id: crypto.randomUUID(), ...arg };
							}
						}

						await Promise.all(
							argArray[0].map((options: { id: string }) =>
								introspectAndModifyInstance(options.id)
							)
						);

						const createPromises = (argArray[0] ?? []).map(
							(arg: WorkflowInstanceCreateOptions) => target["create"](arg)
						);
						return Promise.all(createPromises);
					},
				});
			}
			// @ts-expect-error index signature
			return target[property];
		};
	};

	const dispose = () => {
		env[bindingName] = originalWorkflow;
	};

	// Create a single handler instance to be reused
	const proxyGetHandler = createWorkflowProxyGetHandler();

	// Apply the proxies using the shared handler logic

	env[bindingName] = new Proxy(originalWorkflow, {
		get: proxyGetHandler,
	});

	return new WorkflowIntrospectorHandle(
		workflow,
		modifierCallbacks,
		instanceIntrospectors,
		dispose
	);
}

class WorkflowIntrospectorHandle implements WorkflowIntrospector {
	workflow: WorkflowBinding;
	#modifierCallbacks: ModifierCallback[];
	#instanceIntrospectors: WorkflowInstanceIntrospector[];
	#disposeCallback: () => void;

	constructor(
		workflow: WorkflowBinding,
		modifierCallbacks: ModifierCallback[],
		instanceIntrospectors: WorkflowInstanceIntrospector[],
		disposeCallback: () => void
	) {
		this.workflow = workflow;
		this.#modifierCallbacks = modifierCallbacks;
		this.#instanceIntrospectors = instanceIntrospectors;
		this.#disposeCallback = disposeCallback;
	}

	async modifyAll(fn: ModifierCallback): Promise<void> {
		this.#modifierCallbacks.push(fn);
	}

	get(): WorkflowInstanceIntrospector[] {
		return this.#instanceIntrospectors;
	}

	async dispose(): Promise<void> {
		// also disposes all instance introspectors
		await Promise.all(
			this.#instanceIntrospectors.map((introspector) => introspector.dispose())
		);
		this.#modifierCallbacks = [];
		this.#instanceIntrospectors = [];
		this.#disposeCallback();
	}

	async [Symbol.asyncDispose](): Promise<void> {
		await this.dispose();
	}
}
