import { it } from "vitest";
import { WorkflowIntrospectorHandle } from "../src/introspection";
import type {
	WorkflowBinding,
	WorkflowInstanceModifier,
	WorkflowIntrospectionOperation,
} from "../src/types";

const INSTANCE_COUNT = 1_000;

/**
 * Binding double that counts modifier acquisitions and observes abort
 * concurrency, without running any real workflow instances.
 */
class CountingIntrospectionBinding {
	readonly instanceIds = Array.from(
		{ length: INSTANCE_COUNT },
		(_, index) => `instance-${index}`
	);

	modifierAcquisitions = 0;
	readonly modifiedIds: string[] = [];

	abortCalls = 0;
	#activeAborts = 0;
	peakActiveAborts = 0;

	async unsafeStartIntrospection(): Promise<string> {
		return "counting-session";
	}

	async unsafeStopIntrospection(): Promise<void> {}

	async unsafeSetIntrospectionOperations(
		_sessionId: string,
		_operations: WorkflowIntrospectionOperation[]
	): Promise<void> {}

	async unsafeGetIntrospectionInstances(): Promise<string[]> {
		return this.instanceIds.slice();
	}

	async unsafeGetInstanceModifier(
		instanceId: string
	): Promise<WorkflowInstanceModifier> {
		this.modifierAcquisitions++;
		const binding = this;
		return {
			async disableSleeps() {
				binding.modifiedIds.push(instanceId);
			},
			async disableRetryDelays() {},
			async mockStepResult() {},
			async mockStepError() {},
			async forceStepTimeout() {},
			async mockEvent() {},
			async forceEventTimeout() {},
		};
	}

	async unsafeAbort(
		_instanceId: string,
		_reason?: string
	): Promise<void> {
		this.abortCalls++;
		this.#activeAborts++;
		this.peakActiveAborts = Math.max(
			this.peakActiveAborts,
			this.#activeAborts
		);
		try {
			// Asynchronous completion, so overlapping aborts are observable.
			await new Promise<void>((resolve) => setTimeout(resolve));
		} finally {
			this.#activeAborts--;
		}
	}
}

/** Let any lazily-started acquisitions or aborts surface before asserting. */
async function settle(): Promise<void> {
	for (let i = 0; i < 5; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve));
	}
}

it("lists and reads instances without acquiring modifiers", async ({
	expect,
}) => {
	const binding = new CountingIntrospectionBinding();
	const introspector = new WorkflowIntrospectorHandle(
		binding as unknown as WorkflowBinding
	);
	await introspector.start();

	const handles = await introspector.get();
	expect(handles).toHaveLength(INSTANCE_COUNT);

	await settle();
	expect(binding.modifierAcquisitions).toBe(0);

	await introspector.dispose();
	await settle();
	// Cleanup still reaches every recorded instance, without a modifier fan-out.
	expect(binding.abortCalls).toBe(INSTANCE_COUNT);
	expect(binding.peakActiveAborts).toBeLessThan(INSTANCE_COUNT);
});

it("disposes unused instances without acquiring modifiers and with bounded concurrency", async ({
	expect,
}) => {
	const binding = new CountingIntrospectionBinding();
	const introspector = new WorkflowIntrospectorHandle(
		binding as unknown as WorkflowBinding
	);
	await introspector.start();

	await introspector.dispose();
	await settle();

	expect(binding.modifierAcquisitions).toBe(0);
	expect(binding.abortCalls).toBe(INSTANCE_COUNT);
	expect(binding.peakActiveAborts).toBeLessThan(INSTANCE_COUNT);
});

it("acquires a single modifier when one instance is modified", async ({
	expect,
}) => {
	const binding = new CountingIntrospectionBinding();
	const introspector = new WorkflowIntrospectorHandle(
		binding as unknown as WorkflowBinding
	);
	await introspector.start();

	const [instance] = await introspector.get();
	await instance.modify((modifier) => modifier.disableSleeps());

	await settle();
	expect(binding.modifierAcquisitions).toBe(1);
	expect(binding.modifiedIds).toEqual([binding.instanceIds[0]]);

	await introspector.dispose();
});
