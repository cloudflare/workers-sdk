import { env } from "cloudflare:test";
import { isAbortError } from "../src/lib/errors";
import { setTestWorkflowCallback } from "./test-entry";
import type {
	DatabaseInstance,
	DatabaseVersion,
	DatabaseWorkflow,
	Engine,
} from "../src/engine";
import type { WorkflowStep } from "cloudflare:workers";

// Track fire-and-forget init() RPC promises so they can be settled
// in afterAll hooks before vitest tears down miniflare
const pendingInits: Promise<unknown>[] = [];

/**
 * Await all tracked init promises (with a timeout safety net).
 * Call this in afterAll() for every test file that uses runWorkflow().
 */
export async function settlePendingWorkflows(): Promise<void> {
	await Promise.allSettled(pendingInits);
	pendingInits.length = 0;
}

export async function runWorkflow(
	instanceId: string,
	callback: (event: unknown, step: WorkflowStep) => Promise<unknown>
): Promise<DurableObjectStub<Engine>> {
	const engineId = env.ENGINE.idFromName(instanceId);
	const engineStub = env.ENGINE.get(engineId);

	setTestWorkflowCallback(callback);

	// Fire-and-forget: catch to prevent unhandled rejections when the DO
	// aborts (e.g. pause, terminate, restart, NonRetryableError).
	// The promise is tracked so it can be settled in afterAll before
	// vitest tears down the miniflare HTTP server.
	const initPromise = engineStub
		.init(
			12346,
			{} as DatabaseWorkflow,
			{} as DatabaseVersion,
			{ id: instanceId } as DatabaseInstance,
			{ payload: {}, timestamp: new Date(), instanceId }
		)
		.catch((e: unknown) => {
			// Suppress abort errors since they're expected
			if (!isAbortError(e)) {
				throw e;
			}
		});

	pendingInits.push(initPromise);

	return engineStub;
}

export async function runWorkflowAndAwait(
	instanceId: string,
	callback: (event: unknown, step: WorkflowStep) => Promise<unknown>
): Promise<DurableObjectStub<Engine>> {
	const engineId = env.ENGINE.idFromName(instanceId);
	const engineStub = env.ENGINE.get(engineId);

	setTestWorkflowCallback(callback);

	await engineStub
		.init(
			12346,
			{} as DatabaseWorkflow,
			{} as DatabaseVersion,
			{ id: instanceId } as DatabaseInstance,
			{ payload: {}, timestamp: new Date(), instanceId }
		)
		.catch((e: unknown) => {
			// Suppress abort errors since they're expected
			if (!isAbortError(e)) {
				throw e;
			}
		});

	return engineStub;
}
