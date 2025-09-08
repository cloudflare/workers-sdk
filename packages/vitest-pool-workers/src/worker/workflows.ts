import {
	instanceStatusName,
	InstanceStatus as InstanceStatusNumber,
} from "@cloudflare/workflows-shared/src/instance";
import { runInRunnerObject } from "./durable-objects";
import { env, internalEnv } from "./env";
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

	cleanUp(): Promise<void>;
}

export async function introspectWorkflowInstance(
	workflow: Workflow,
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
	#workflow: Workflow;
	#instanceId: string;
	#instanceModifier: WorkflowInstanceModifier;

	constructor(workflow: Workflow, instanceId: string) {
		this.#workflow = workflow;
		this.#instanceId = instanceId;
		// @ts-expect-error not exposed
		this.#instanceModifier = workflow.unsafeGetInstanceModifier(instanceId);
	}

	async modify(fn: ModifierCallback): Promise<WorkflowInstanceIntrospector> {
		await fn(this.#instanceModifier);

		return this;
	}

	async waitForStepResult(step: StepSelector): Promise<unknown> {
		// @ts-expect-error not exposed
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
		// @ts-expect-error not exposed
		await this.#workflow.unsafeWaitForStatus(this.#instanceId, status);
	}

	async cleanUp(): Promise<void> {
		// @ts-expect-error not exposed
		await this.#workflow.unsafeAbort(this.#instanceId, "Instance clean up");
	}

	async [Symbol.asyncDispose](): Promise<void> {
		await this.cleanUp();
	}
}

// See public facing `cloudflare:test` types for docs
export interface WorkflowIntrospector {
	modifyAll(fn: ModifierCallback): void;

	get(): WorkflowInstanceIntrospector[];

	cleanUp(): Promise<void>;
}

export async function introspectWorkflow(
	workflow: Workflow
): Promise<WorkflowIntrospectorHandle> {
	if (!workflow) {
		throw new Error("[WorkflowIntrospector] Workflow binding is required.");
	}

	const modifierCallbacks: ModifierCallback[] = [];
	const instanceIntrospectors: WorkflowInstanceIntrospector[] = [];
	// @ts-expect-error getBindingName not exposed
	const bindingName = await workflow.unsafeGetBindingName();
	const internalOriginalWorkflow = internalEnv[bindingName] as Workflow;
	const externalOriginalWorkflow = env[bindingName] as Workflow;

	const introspectAndModifyInstance = async (instanceId: string) => {
		try {
			await runInRunnerObject(internalEnv, async () => {
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

	const cleanup = () => {
		internalEnv[bindingName] = internalOriginalWorkflow;
		env[bindingName] = externalOriginalWorkflow;
	};

	// Create a single handler instance to be reused
	const proxyGetHandler = createWorkflowProxyGetHandler();

	// Apply the proxies using the shared handler logic
	internalEnv[bindingName] = new Proxy(internalOriginalWorkflow, {
		get: proxyGetHandler,
	});
	env[bindingName] = new Proxy(externalOriginalWorkflow, {
		get: proxyGetHandler,
	});

	return new WorkflowIntrospectorHandle(
		workflow,
		modifierCallbacks,
		instanceIntrospectors,
		cleanup
	);
}

class WorkflowIntrospectorHandle implements WorkflowIntrospector {
	workflow: Workflow;
	#modifierCallbacks: ModifierCallback[];
	#instanceIntrospectors: WorkflowInstanceIntrospector[];
	#cleanupCallback: () => void;

	constructor(
		workflow: Workflow,
		modifierCallbacks: ModifierCallback[],
		instanceIntrospectors: WorkflowInstanceIntrospector[],
		cleanupCallback: () => void
	) {
		this.workflow = workflow;
		this.#modifierCallbacks = modifierCallbacks;
		this.#instanceIntrospectors = instanceIntrospectors;
		this.#cleanupCallback = cleanupCallback;
	}

	modifyAll(fn: ModifierCallback): void {
		this.#modifierCallbacks.push(fn);
	}

	get(): WorkflowInstanceIntrospector[] {
		return this.#instanceIntrospectors;
	}

	async cleanUp(): Promise<void> {
		// also cleans all instance introspectors
		await Promise.all(
			this.#instanceIntrospectors.map((introspector) => introspector.cleanUp())
		);
		this.#modifierCallbacks = [];
		this.#instanceIntrospectors = [];
		this.#cleanupCallback();
	}

	async [Symbol.asyncDispose](): Promise<void> {
		await this.cleanUp();
	}
}
