import { createExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, it, vi } from "vitest";
import workerdUnsafe from "workerd:unsafe";
import { WorkflowBinding } from "../src/binding";
import { WorkflowInstanceIntrospectorHandle } from "../src/introspection";
import { WorkflowInstanceModifier } from "../src/modifier";
import { setTestWorkflowCallback } from "./test-entry";
import { runWorkflowAndAwait } from "./utils";
import type { WorkflowBinding as IntrospectionBinding } from "../src/types";

afterEach(async () => {
	await workerdUnsafe.abortAllDurableObjects();
	Reflect.deleteProperty(WorkflowInstanceModifier.prototype, Symbol.dispose);
});

function createBinding(): WorkflowBinding {
	return new WorkflowBinding(createExecutionContext(), {
		ENGINE: env.ENGINE,
		BINDING_NAME: "TEST_WORKFLOW",
		WORKFLOW_NAME: "test-workflow",
	});
}

it("releases the step callback's RPC result and preserves the live data shape", async ({
	expect,
}) => {
	const dispose = vi.fn();
	let result: unknown;
	await runWorkflowAndAwait(crypto.randomUUID(), async (_event, step) => {
		result = await step.do("RPC result", async () => ({
			value: 42,
			bytes: new Uint8Array(new ArrayBuffer(8), 2, 2),
			[Symbol.dispose]: dispose,
		}));
	});

	expect(result).toEqual({ value: 42, bytes: new Uint8Array(2) });
	expect(result).toHaveProperty("bytes.byteOffset", 2);
	expect(result).toHaveProperty("bytes.buffer.byteLength", 8);
	// The remote disposer runs asynchronously after the local stub is released.
	await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
});

it.for([false, true])(
	"disposes an introspector's modifier (modified: %s)",
	async (modified, { expect }) => {
		const binding = createBinding();
		await using instance = new WorkflowInstanceIntrospectorHandle(
			binding as unknown as IntrospectionBinding,
			crypto.randomUUID()
		);
		if (modified) {
			await instance.modify((modifier) => modifier.disableSleeps());
		}

		await instance.dispose();
		await expect(
			instance.modify((modifier) => modifier.disableSleeps())
		).rejects.toThrow("RPC stub used after being disposed");
		// The await-using scope calls dispose() again, exercising idempotence.
	}
);

it.for([false, true])(
	"releases the temporary modifier used by create (modified: %s)",
	async (modified, { expect }) => {
		const id = crypto.randomUUID();
		const binding = createBinding();
		const dispose = vi.fn();
		// RPC target disposers are looked up on the prototype.
		Object.defineProperty(WorkflowInstanceModifier.prototype, Symbol.dispose, {
			value: dispose,
			configurable: true,
		});

		const sessionId = await binding.unsafeStartIntrospection();
		try {
			if (modified) {
				await binding.unsafeSetIntrospectionOperations(sessionId, [
					{ type: "disableSleeps" },
				]);
			}
			setTestWorkflowCallback(async () => undefined);
			await binding.create({ id });
			const instance = await binding.get(id);
			await vi.waitUntil(
				async () => (await instance.status()).status === "complete"
			);
			await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
		} finally {
			await binding.unsafeStopIntrospection(sessionId);
			await binding.unsafeAbort(id);
		}
	}
);
