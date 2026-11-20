import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, it, vi } from "vitest";
import workerdUnsafe from "workerd:unsafe";
import {
	getCronInstanceId,
	getNextCronOccurrence,
	InstanceEvent,
	instanceStatusName,
	InstanceTrigger,
} from "../src";
import { setTestWorkflowCallback } from "./test-entry";
import type { Engine, EngineLogs } from "../src/engine";
import type { WorkflowEvent } from "cloudflare:workers";

afterEach(async () => {
	await workerdUnsafe.abortAllDurableObjects();
});

let cronCounter = 0;
// A fresh daily cron per test keeps deterministic instance ids from colliding
// across tests/retries (its next occurrence is stable for a test's lifetime).
function uniqueCron(): string {
	const minute = cronCounter++ % 60;
	return `${minute} 0 * * *`;
}

async function waitUntilLogEvent(
	stub: DurableObjectStub<Engine>,
	event: InstanceEvent,
	timeout = 5000
): Promise<void> {
	await vi.waitUntil(
		async () => {
			const logs = (await stub.readLogs()) as EngineLogs;
			return logs.logs.some((log) => log.event === event);
		},
		{ timeout }
	);
}

function triggerSourceOf(logs: EngineLogs, event: InstanceEvent) {
	const log = logs.logs.find((l) => l.event === event);
	return (log?.metadata as { trigger?: { source?: number } } | undefined)
		?.trigger?.source;
}

describe("cron helpers", () => {
	it("computes the next occurrence strictly after the reference time", async ({
		expect,
	}) => {
		const reference = Date.parse("2025-01-01T00:00:30.000Z");
		const next = await getNextCronOccurrence(
			env.SAFFRON,
			"* * * * *",
			reference
		);
		// Next minute boundary after 00:00:30 is 00:01:00.
		expect(next).toBe(Date.parse("2025-01-01T00:01:00.000Z"));
		expect(next).toBeGreaterThan(reference);
	});

	it("never returns the reference time itself on a boundary", async ({
		expect,
	}) => {
		const boundary = Date.parse("2025-01-01T00:00:00.000Z");
		const next = await getNextCronOccurrence(
			env.SAFFRON,
			"* * * * *",
			boundary
		);
		expect(next).toBe(Date.parse("2025-01-01T00:01:00.000Z"));
	});

	it("builds a deterministic instance id from expression and time", ({
		expect,
	}) => {
		expect(getCronInstanceId("0 * * * *", 1_700_000_000_000)).toBe(
			"0 * * * *-1700000000000"
		);
	});
});

describe("Engine cron", () => {
	it("seeds a queued instance and arms an alarm without running yet", async ({
		expect,
	}) => {
		const expression = uniqueCron();
		const scheduledTime = Date.now() + 60_000;
		const id = getCronInstanceId(expression, scheduledTime);
		const stub = env.ENGINE.get(env.ENGINE.idFromName(id));

		await stub.initCron(
			{ accountId: 0, workflowName: "cron-wf", instanceId: id, params: {} },
			{ expression, scheduledTime }
		);

		const logs = (await stub.readLogs()) as EngineLogs;
		expect(
			logs.logs.some((l) => l.event === InstanceEvent.WORKFLOW_QUEUED)
		).toBe(true);
		expect(
			logs.logs.some((l) => l.event === InstanceEvent.WORKFLOW_START)
		).toBe(false);
		expect(triggerSourceOf(logs, InstanceEvent.WORKFLOW_QUEUED)).toBe(
			InstanceTrigger.CRON
		);

		const status = await stub.getStatus();
		expect(instanceStatusName(status)).toBe("queued");

		const alarm = await runInDurableObject(stub, (_i, state) =>
			state.storage.getAlarm()
		);
		expect(alarm).toBe(scheduledTime);
	});

	it("is idempotent — re-seeding the same instance does not duplicate", async ({
		expect,
	}) => {
		const expression = uniqueCron();
		const scheduledTime = Date.now() + 60_000;
		const id = getCronInstanceId(expression, scheduledTime);
		const stub = env.ENGINE.get(env.ENGINE.idFromName(id));

		const seed = {
			accountId: 0,
			workflowName: "cron-wf",
			instanceId: id,
			params: {},
		};
		await stub.initCron(seed, { expression, scheduledTime });
		await stub.initCron(seed, { expression, scheduledTime });

		const logs = (await stub.readLogs()) as EngineLogs;
		expect(
			logs.logs.filter((l) => l.event === InstanceEvent.WORKFLOW_QUEUED)
		).toHaveLength(1);
	});

	it("runs the workflow with event.schedule populated when the alarm fires", async ({
		expect,
	}) => {
		const expression = uniqueCron();
		const scheduledTime = Date.now() + 60_000;
		const id = getCronInstanceId(expression, scheduledTime);
		const stub = env.ENGINE.get(env.ENGINE.idFromName(id));

		let captured: WorkflowEvent<unknown> | undefined;
		setTestWorkflowCallback(async (event) => {
			captured = event as WorkflowEvent<unknown>;
			return "cron-output";
		});

		await stub.initCron(
			{ accountId: 0, workflowName: "cron-wf", instanceId: id, params: {} },
			{ expression, scheduledTime }
		);

		const ran = await runDurableObjectAlarm(stub);
		expect(ran).toBe(true);

		await waitUntilLogEvent(stub, InstanceEvent.WORKFLOW_SUCCESS);

		expect(captured?.schedule).toEqual({ cron: expression, scheduledTime });
		expect(captured?.workflowName).toBe("cron-wf");

		const logs = (await stub.readLogs()) as EngineLogs;
		expect(
			logs.logs.some((l) => l.event === InstanceEvent.WORKFLOW_START)
		).toBe(true);
		const success = logs.logs.find(
			(l) => l.event === InstanceEvent.WORKFLOW_SUCCESS
		);
		expect(success?.metadata.result).toBe("cron-output");
	});

	it("keeps the workflow name on the instance after the alarm fires", async ({
		expect,
	}) => {
		const expression = uniqueCron();
		const scheduledTime = Date.now() + 60_000;
		const id = getCronInstanceId(expression, scheduledTime);
		const stub = env.ENGINE.get(env.ENGINE.idFromName(id));

		setTestWorkflowCallback(async () => "ok");

		await stub.initCron(
			{ accountId: 0, workflowName: "cron-wf", instanceId: id, params: {} },
			{ expression, scheduledTime }
		);

		await runDurableObjectAlarm(stub);
		await waitUntilLogEvent(stub, InstanceEvent.WORKFLOW_SUCCESS);

		// alarm() re-enters init() with the seeded metadata; the name must survive
		// rather than be clobbered to undefined.
		const workflowName = await runInDurableObject(
			stub,
			(instance) => instance.workflowName
		);
		expect(workflowName).toBe("cron-wf");
	});

	it("chains the next firing onto its own deterministic instance when autoSchedule is on", async ({
		expect,
	}) => {
		const expression = uniqueCron();
		const scheduledTime = Date.now() + 60_000;
		const id = getCronInstanceId(expression, scheduledTime);
		const stub = env.ENGINE.get(env.ENGINE.idFromName(id));

		setTestWorkflowCallback(async () => "ok");

		await stub.initCron(
			{ accountId: 0, workflowName: "cron-wf", instanceId: id, params: {} },
			{ expression, scheduledTime, autoSchedule: true }
		);

		await runDurableObjectAlarm(stub);
		await waitUntilLogEvent(stub, InstanceEvent.WORKFLOW_SUCCESS);

		// The engine seeds the next occurrence from this firing's scheduledTime
		const nextScheduledTime = await getNextCronOccurrence(
			env.SAFFRON,
			expression,
			scheduledTime
		);
		const nextId = getCronInstanceId(expression, nextScheduledTime);
		expect(nextId).not.toBe(id);

		const nextStub = env.ENGINE.get(env.ENGINE.idFromName(nextId));
		const nextLogs = (await nextStub.readLogs()) as EngineLogs;
		expect(
			nextLogs.logs.some((l) => l.event === InstanceEvent.WORKFLOW_QUEUED)
		).toBe(true);
		expect(
			nextLogs.logs.some((l) => l.event === InstanceEvent.WORKFLOW_START)
		).toBe(false);

		const nextAlarm = await runInDurableObject(nextStub, (_i, state) =>
			state.storage.getAlarm()
		);
		expect(nextAlarm).toBe(nextScheduledTime);
	});

	it("propagates the workflow params to the chained firing", async ({
		expect,
	}) => {
		const expression = uniqueCron();
		const scheduledTime = Date.now() + 60_000;
		const id = getCronInstanceId(expression, scheduledTime);
		const stub = env.ENGINE.get(env.ENGINE.idFromName(id));

		setTestWorkflowCallback(async () => "ok");

		await stub.initCron(
			{
				accountId: 0,
				workflowName: "cron-wf",
				instanceId: id,
				params: { foo: "bar" },
			},
			{ expression, scheduledTime, autoSchedule: true }
		);

		await runDurableObjectAlarm(stub);
		await waitUntilLogEvent(stub, InstanceEvent.WORKFLOW_SUCCESS);

		const nextScheduledTime = await getNextCronOccurrence(
			env.SAFFRON,
			expression,
			scheduledTime
		);
		const nextStub = env.ENGINE.get(
			env.ENGINE.idFromName(getCronInstanceId(expression, nextScheduledTime))
		);

		// The chained firing must run with the original params, not `{}`.
		let captured: WorkflowEvent<unknown> | undefined;
		setTestWorkflowCallback(async (event) => {
			captured = event as WorkflowEvent<unknown>;
			return "ok";
		});
		await runDurableObjectAlarm(nextStub);
		await waitUntilLogEvent(nextStub, InstanceEvent.WORKFLOW_SUCCESS);

		expect(captured?.payload).toEqual({ foo: "bar" });
	});

	it("does not chain the next firing by default (autoSchedule off)", async ({
		expect,
	}) => {
		const expression = uniqueCron();
		const scheduledTime = Date.now() + 60_000;
		const id = getCronInstanceId(expression, scheduledTime);
		const stub = env.ENGINE.get(env.ENGINE.idFromName(id));

		setTestWorkflowCallback(async () => "ok");

		await stub.initCron(
			{ accountId: 0, workflowName: "cron-wf", instanceId: id, params: {} },
			{ expression, scheduledTime }
		);

		await runDurableObjectAlarm(stub);
		await waitUntilLogEvent(stub, InstanceEvent.WORKFLOW_SUCCESS);

		// No next occurrence should have been seeded.
		const nextScheduledTime = await getNextCronOccurrence(
			env.SAFFRON,
			expression,
			Date.now()
		);
		const nextId = getCronInstanceId(expression, nextScheduledTime);
		const nextStub = env.ENGINE.get(env.ENGINE.idFromName(nextId));
		const nextLogs = (await nextStub.readLogs()) as EngineLogs;
		expect(nextLogs.logs).toHaveLength(0);
	});

	it("does nothing when alarm() runs on a non-cron instance", async ({
		expect,
	}) => {
		const stub = env.ENGINE.get(env.ENGINE.idFromName("not-a-cron"));
		// No alarm was ever armed, so none runs.
		const ran = await runDurableObjectAlarm(stub);
		expect(ran).toBe(false);
	});
});
