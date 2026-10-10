import { it } from "vitest";
import {
	WorkflowInstanceIntrospectorHandle,
	WorkflowIntrospectorHandle,
} from "../src/introspection";
import type { WorkflowBinding, WorkflowInstanceModifier } from "../src/types";

function createModifier(): WorkflowInstanceModifier {
	return {
		disableSleeps: async () => {},
		disableRetryDelays: async () => {},
		mockStepResult: async () => {},
		mockStepError: async () => {},
		forceStepTimeout: async () => {},
		mockEvent: async () => {},
		forceEventTimeout: async () => {},
	};
}

function createBinding(
	instanceIds: string[],
	overrides: Partial<WorkflowBinding> = {}
): WorkflowBinding {
	return {
		unsafeGetInstanceModifier: async () => createModifier(),
		unsafeWaitForStepResult: async () => undefined,
		unsafeWaitForStatus: async () => {},
		unsafeGetOutputOrError: async (instanceId) => instanceId,
		unsafeAbort: async () => {},
		unsafeStartIntrospection: async () => "session",
		unsafeSetIntrospectionOperations: async () => {},
		unsafeStopIntrospection: async () => {},
		unsafeGetIntrospectionInstances: async () => instanceIds,
		...overrides,
	};
}

it("reads instance handles without acquiring mutation resources", async ({
	expect,
}) => {
	const acquisitions: string[] = [];
	const binding = createBinding(["first", "second"], {
		unsafeGetInstanceModifier: async (instanceId) => {
			acquisitions.push(instanceId);
			return createModifier();
		},
	});
	const introspector = new WorkflowIntrospectorHandle(binding);
	await introspector.start();

	const handles = await introspector.get();
	expect(handles).toHaveLength(2);
	await handles[0].waitForStatus("complete");
	expect(await handles[0].getOutput()).toBe("first");
	expect(acquisitions).toEqual([]);

	await introspector.dispose();
});

it("disposes every recorded instance without acquiring modifiers or unbounded fan-out", async ({
	expect,
}) => {
	const instanceIds = Array.from(
		{ length: 1_000 },
		(_, index) => `instance-${index}`
	);
	let acquisitions = 0;
	let activeAborts = 0;
	let peakConcurrentAborts = 0;
	const abortedIds: string[] = [];
	const binding = createBinding(instanceIds, {
		unsafeGetInstanceModifier: async () => {
			acquisitions++;
			return createModifier();
		},
		unsafeAbort: async (instanceId) => {
			activeAborts++;
			peakConcurrentAborts = Math.max(peakConcurrentAborts, activeAborts);
			await Promise.resolve();
			abortedIds.push(instanceId);
			activeAborts--;
		},
	});
	const introspector = new WorkflowIntrospectorHandle(binding);
	await introspector.start();
	await introspector.dispose();

	expect(acquisitions).toBe(0);
	expect(abortedIds).toHaveLength(1_000);
	expect(new Set(abortedIds).size).toBe(1_000);
	expect(peakConcurrentAborts).toBeLessThanOrEqual(32);
});

it("acquires one modifier on the first modify call and shares it across concurrent calls", async ({
	expect,
}) => {
	let acquisitions = 0;
	const modifier = createModifier();
	const binding = createBinding([], {
		unsafeGetInstanceModifier: async () => {
			acquisitions++;
			return modifier;
		},
	});
	const instance = new WorkflowInstanceIntrospectorHandle(binding, "first");
	expect(acquisitions).toBe(0);

	await Promise.all([
		instance.modify(async (received) => {
			expect(received).toBe(modifier);
		}),
		instance.modify(async (received) => {
			expect(received).toBe(modifier);
		}),
	]);
	await instance.modify(async (received) => {
		expect(received).toBe(modifier);
	});
	expect(acquisitions).toBe(1);
	await instance.dispose();
});

it("surfaces modifier acquisition failure only when modify is called", async ({
	expect,
}) => {
	const error = new Error("modifier unavailable");
	let acquisitions = 0;
	let aborts = 0;
	const binding = createBinding([], {
		unsafeGetInstanceModifier: async () => {
			acquisitions++;
			throw error;
		},
		unsafeAbort: async () => {
			aborts++;
		},
	});
	const instance = new WorkflowInstanceIntrospectorHandle(binding, "first");
	expect(acquisitions).toBe(0);
	await expect(instance.modify(async () => {})).rejects.toBe(error);
	await expect(instance.modify(async () => {})).rejects.toBe(error);
	expect(acquisitions).toBe(1);
	await instance.dispose();
	expect(aborts).toBe(1);
});

it("does not acquire a modifier after instance disposal", async ({
	expect,
}) => {
	let acquisitions = 0;
	let aborts = 0;
	const binding = createBinding([], {
		unsafeGetInstanceModifier: async () => {
			acquisitions++;
			return createModifier();
		},
		unsafeAbort: async () => {
			aborts++;
		},
	});
	const instance = new WorkflowInstanceIntrospectorHandle(binding, "first");
	await instance.dispose();
	await expect(instance.modify(async () => {})).rejects.toThrow("disposed");
	expect(acquisitions).toBe(0);
	expect(aborts).toBe(1);
});

it("attempts every instance cleanup before propagating an abort error", async ({
	expect,
}) => {
	const instanceIds = Array.from(
		{ length: 70 },
		(_, index) => `instance-${index}`
	);
	const error = new Error("abort failed");
	const abortedIds: string[] = [];
	let stopCalls = 0;
	const binding = createBinding(instanceIds, {
		unsafeStopIntrospection: async () => {
			stopCalls++;
		},
		unsafeAbort: async (instanceId) => {
			if (instanceId === "instance-0") {
				abortedIds.push(instanceId);
				throw error;
			}
			await new Promise((resolve) => setTimeout(resolve, 0));
			abortedIds.push(instanceId);
		},
	});
	const introspector = new WorkflowIntrospectorHandle(binding);
	await introspector.start();
	await expect(introspector.dispose()).rejects.toBe(error);
	expect(stopCalls).toBe(1);
	expect(abortedIds).toHaveLength(70);
	expect(new Set(abortedIds).size).toBe(70);
});

it("does not repeat workflow cleanup when disposed more than once", async ({
	expect,
}) => {
	let stops = 0;
	let aborts = 0;
	const binding = createBinding(["first"], {
		unsafeStopIntrospection: async () => {
			stops++;
		},
		unsafeAbort: async () => {
			aborts++;
		},
	});
	const introspector = new WorkflowIntrospectorHandle(binding);
	await introspector.start();
	await Promise.all([introspector.dispose(), introspector.dispose()]);
	await introspector.dispose();
	expect(stops).toBe(1);
	expect(aborts).toBe(1);
});

it("does not run a pending modification after instance disposal", async ({
	expect,
}) => {
	let resolveModifier:
		| ((modifier: WorkflowInstanceModifier) => void)
		| undefined;
	const modifierPromise = new Promise<WorkflowInstanceModifier>((resolve) => {
		resolveModifier = resolve;
	});
	let callbacks = 0;
	let aborts = 0;
	const binding = createBinding([], {
		unsafeGetInstanceModifier: async () => modifierPromise,
		unsafeAbort: async () => {
			aborts++;
		},
	});
	const instance = new WorkflowInstanceIntrospectorHandle(binding, "first");
	const modification = instance.modify(async () => {
		callbacks++;
	});
	const disposal = instance.dispose();
	if (resolveModifier === undefined) {
		throw new Error("Expected modifier acquisition to start");
	}
	resolveModifier(createModifier());
	await disposal;
	await expect(modification).rejects.toThrow("disposed");
	expect(callbacks).toBe(0);
	expect(aborts).toBe(1);
});

it("aborts an instance only once when disposed repeatedly", async ({
	expect,
}) => {
	let aborts = 0;
	const binding = createBinding([], {
		unsafeAbort: async () => {
			aborts++;
		},
	});
	const instance = new WorkflowInstanceIntrospectorHandle(binding, "first");
	await Promise.all([instance.dispose(), instance.dispose()]);
	await instance.dispose();
	expect(aborts).toBe(1);
});
