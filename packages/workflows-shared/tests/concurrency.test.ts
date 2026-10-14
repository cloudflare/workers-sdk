import { afterEach, describe, it, vi } from "vitest";
import workerdUnsafe from "workerd:unsafe";
import { InstanceEvent } from "../src";
import { runWorkflow } from "./utils";
import type { Engine, EngineLogs } from "../src/engine";
import type { WorkflowStepConfig } from "cloudflare:workers";

afterEach(async () => {
	await workerdUnsafe.abortAllDurableObjects();
});

// Released workers-types do not declare `concurrency` yet, so tests build keyed configs
// through this helper instead of casting at every call site.
function keyed(
	concurrency: string | string[],
	config: WorkflowStepConfig = {}
): WorkflowStepConfig {
	return { ...config, concurrency } as WorkflowStepConfig;
}

async function waitForLog(
	engineStub: DurableObjectStub<Engine>,
	event: InstanceEvent
) {
	await vi.waitUntil(
		async () => {
			const logs = (await engineStub.readLogs()) as EngineLogs;
			return logs.logs.some((log) => log.event === event);
		},
		{ timeout: 5000 }
	);
}

describe("Step concurrency config", () => {
	it("runs a step that references concurrency keys", async ({ expect }) => {
		const engineStub = await runWorkflow("KEYED-STEP", async (_event, step) => {
			const single = await step.do("single", keyed("k1"), async () => 1);
			const multi = await step.do("multi", keyed(["k1", "k2"]), async () => 2);
			return single + multi;
		});

		await waitForLog(engineStub, InstanceEvent.WORKFLOW_SUCCESS);
		const logs = (await engineStub.readLogs()) as EngineLogs;
		const success = logs.logs.find(
			(log) => log.event === InstanceEvent.WORKFLOW_SUCCESS
		);
		expect(success?.metadata.result).toBe(3);
	});

	it("fails a step that references the same key twice", async ({ expect }) => {
		const engineStub = await runWorkflow(
			"DUPLICATE-KEY",
			async (_event, step) => {
				await step.do("dup", keyed(["k1", "k1"]), async () => 1);
			}
		);

		await waitForLog(engineStub, InstanceEvent.WORKFLOW_FAILURE);
		const logs = (await engineStub.readLogs()) as EngineLogs;
		const failure = logs.logs.find(
			(log) => log.event === InstanceEvent.WORKFLOW_FAILURE
		);
		expect(failure?.metadata.error.message).toContain(
			'Step config for "dup" references concurrency key "k1" more than once'
		);
	});
});
