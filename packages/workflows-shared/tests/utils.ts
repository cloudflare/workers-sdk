import { env } from "cloudflare:workers";
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

export function encodeUtf8(str: string): Uint8Array {
	return new TextEncoder().encode(str);
}

export function decodeUtf8(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes);
}

export async function readStreamBytes(
	stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
	const chunks: Uint8Array[] = [];
	const reader = stream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		chunks.push(value);
	}
	let totalLength = 0;
	for (const chunk of chunks) {
		totalLength += chunk.byteLength;
	}
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

export async function runWorkflow(
	instanceId: string,
	callback: (event: unknown, step: WorkflowStep) => Promise<unknown>
): Promise<DurableObjectStub<Engine>> {
	const engineId = env.ENGINE.idFromName(instanceId);
	const engineStub = env.ENGINE.get(engineId);

	setTestWorkflowCallback(callback);

	// Fire-and-forget: suppress all rejections to prevent unhandled
	// rejections inside workerd (which crash the HTTP server on Windows).
	// Abort errors (pause, terminate, restart) are expected; workflow
	// errors (NonRetryableError, step failures) are also expected for
	// tests that intentionally trigger them. Tests validate correctness
	// through separate log/status assertions, not through init()'s result.
	const initPromise = engineStub
		.init(
			12346,
			{} as DatabaseWorkflow,
			{} as DatabaseVersion,
			{ id: instanceId } as DatabaseInstance,
			{ payload: {}, timestamp: new Date(), instanceId, workflowName: "" }
		)
		.catch(() => {});

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
			{ payload: {}, timestamp: new Date(), instanceId, workflowName: "" }
		)
		.catch(() => {});

	return engineStub;
}
