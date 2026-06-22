import type {
	ModifierCallback,
	WorkflowBinding,
	WorkflowInstanceIntrospector,
	WorkflowInstanceModifier,
	WorkflowIntrospectionOperation,
	WorkflowIntrospector,
	WorkflowStepSelector,
} from "./types";

export class WorkflowInstanceModificationRecorder implements WorkflowInstanceModifier {
	constructor(private readonly operations: WorkflowIntrospectionOperation[]) {}

	async disableSleeps(steps?: WorkflowStepSelector[]): Promise<void> {
		this.operations.push({ type: "disableSleeps", steps });
	}

	async disableRetryDelays(steps?: WorkflowStepSelector[]): Promise<void> {
		this.operations.push({ type: "disableRetryDelays", steps });
	}

	async mockStepResult(
		step: WorkflowStepSelector,
		stepResult: unknown
	): Promise<void> {
		this.operations.push({ type: "mockStepResult", step, stepResult });
	}

	async mockStepError(
		step: WorkflowStepSelector,
		error: Error,
		times?: number
	): Promise<void> {
		this.operations.push({
			type: "mockStepError",
			step,
			error: { name: error.name, message: error.message },
			times,
		});
	}

	async forceStepTimeout(
		step: WorkflowStepSelector,
		times?: number
	): Promise<void> {
		this.operations.push({ type: "forceStepTimeout", step, times });
	}

	async mockEvent(event: { type: string; payload: unknown }): Promise<void> {
		this.operations.push({ type: "mockEvent", event });
	}

	async forceEventTimeout(step: WorkflowStepSelector): Promise<void> {
		this.operations.push({ type: "forceEventTimeout", step });
	}
}

export class WorkflowIntrospectorHandle implements WorkflowIntrospector {
	#disposed = false;
	#sessionId: string | undefined;
	#instanceIntrospectors = new Map<string, WorkflowInstanceIntrospector>();
	#operations: WorkflowIntrospectionOperation[] = [];

	constructor(private readonly workflow: WorkflowBinding) {}

	async start(): Promise<void> {
		this.#sessionId = await this.workflow.unsafeStartIntrospection();
	}

	private getSessionId(): string {
		if (this.#sessionId === undefined) {
			throw new Error("Workflow introspection has not started.");
		}
		return this.#sessionId;
	}

	async modifyAll(fn: ModifierCallback): Promise<void> {
		const sessionId = this.getSessionId();
		await fn(new WorkflowInstanceModificationRecorder(this.#operations));
		await this.workflow.unsafeSetIntrospectionOperations(
			sessionId,
			this.#operations
		);
	}

	async get(): Promise<WorkflowInstanceIntrospector[]> {
		const sessionId = this.getSessionId();
		const instanceIds =
			await this.workflow.unsafeGetIntrospectionInstances(sessionId);

		for (const instanceId of instanceIds) {
			if (!this.#instanceIntrospectors.has(instanceId)) {
				this.#instanceIntrospectors.set(
					instanceId,
					new WorkflowInstanceIntrospectorHandle(this.workflow, instanceId)
				);
			}
		}

		return Array.from(this.#instanceIntrospectors.values());
	}

	/** Keep this bound; explicit resource management may call the disposer unbound. */
	dispose = async (): Promise<void> => {
		if (this.#disposed) {
			return;
		}
		this.#disposed = true;
		const sessionId = this.#sessionId;

		if (sessionId !== undefined) {
			await this.workflow.unsafeStopIntrospection(sessionId);
		}
		await Promise.all(
			Array.from(this.#instanceIntrospectors.values(), (introspector) =>
				introspector.dispose()
			)
		);
		this.#instanceIntrospectors.clear();
	};

	async [Symbol.asyncDispose](): Promise<void> {
		await this.dispose();
	}
}

export class WorkflowInstanceIntrospectorHandle implements WorkflowInstanceIntrospector {
	#instanceModifier: WorkflowInstanceModifier | undefined;
	#instanceModifierPromise: Promise<WorkflowInstanceModifier> | undefined;

	constructor(
		private readonly workflow: WorkflowBinding,
		private readonly instanceId: string
	) {
		this.#instanceModifierPromise = workflow
			.unsafeGetInstanceModifier(instanceId)
			.then((modifier) => {
				this.#instanceModifier = modifier as WorkflowInstanceModifier;
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

	async waitForStepResult(step: WorkflowStepSelector): Promise<unknown> {
		return await this.workflow.unsafeWaitForStepResult(
			this.instanceId,
			step.name,
			step.index
		);
	}

	async waitForStatus(status: string): Promise<void> {
		if (status === "queued") {
			return;
		}

		await this.workflow.unsafeWaitForStatus(this.instanceId, status);
	}

	async getOutput(): Promise<unknown> {
		return await this.workflow.unsafeGetOutputOrError(this.instanceId, true);
	}

	async getError(): Promise<{ name: string; message: string }> {
		return (await this.workflow.unsafeGetOutputOrError(
			this.instanceId,
			false
		)) as { name: string; message: string };
	}

	/** Keep this bound; explicit resource management may call the disposer unbound. */
	dispose = async (): Promise<void> => {
		await this.workflow.unsafeAbort(this.instanceId, "Instance dispose");
	};

	async [Symbol.asyncDispose](): Promise<void> {
		await this.dispose();
	}
}
