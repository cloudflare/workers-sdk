import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import workerdUnsafe from "workerd:unsafe";
import {
	CONCURRENCY_KEYS_OBJECT_NAME,
	ConcurrencyKeysAdmin,
	InstanceEvent,
	InstanceStatus,
} from "../src";
import { isAbortError } from "../src/lib/errors";
import { runWorkflow } from "./utils";
import type { Engine, EngineLogs } from "../src/engine";
import type { WorkflowStepConfig } from "cloudflare:workers";

// Optional in `Cloudflare.Env` like the Engine's own binding, or the Engine would stop
// satisfying the `DurableObject<Cloudflare.Env>` constraint of `runInDurableObject()`.
function concurrencyKeys() {
	const namespace = env.CONCURRENCY_KEYS;
	if (namespace === undefined) {
		throw new Error("CONCURRENCY_KEYS is not bound");
	}
	return namespace.get(namespace.idFromName(CONCURRENCY_KEYS_OBJECT_NAME));
}

beforeEach(async () => {
	await concurrencyKeys().reset();
});

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

// Aborting an Engine breaks the stubs pointing at it, so reads after a terminal failure
// need a fresh stub for the same instance.
function freshStub(engineStub: DurableObjectStub<Engine>) {
	return env.ENGINE.get(engineStub.id);
}

async function statusOf(engineStub: DurableObjectStub<Engine>) {
	return await freshStub(engineStub).getStatus();
}

async function readLogs(engineStub: DurableObjectStub<Engine>) {
	return ((await freshStub(engineStub).readLogs()) as EngineLogs).logs;
}

async function waitForLog(
	engineStub: DurableObjectStub<Engine>,
	event: InstanceEvent,
	count = 1
) {
	await vi.waitUntil(
		async () => {
			try {
				const logs = await readLogs(engineStub);
				return logs.filter((log) => log.event === event).length >= count;
			} catch (e) {
				if (isAbortError(e)) {
					return false;
				}
				throw e;
			}
		},
		{ timeout: 5000 }
	);
}

async function waitForUsage(
	name: string,
	usage: { holding: number; waiting: number }
) {
	await vi.waitUntil(
		async () => {
			const key = await concurrencyKeys().getKey(name);
			return (
				key?.usage.holding === usage.holding &&
				key.usage.waiting === usage.waiting
			);
		},
		{ timeout: 5000 }
	);
}

// Awaiting the RPC call inside a try keeps workerd from also reporting its rejection
// as unhandled, which `expect(...).rejects` on the raw RPC promise does not.
async function errorMessage(call: () => Promise<unknown>): Promise<string> {
	try {
		await call();
	} catch (e) {
		return String(e);
	}
	throw new Error("Expected the call to fail");
}

async function changeStatus(
	engineStub: DurableObjectStub<Engine>,
	status: "pause" | "resume" | "terminate"
) {
	try {
		await runInDurableObject(engineStub, (engine) =>
			engine.changeInstanceStatus(status)
		);
	} catch (e) {
		if (!isAbortError(e)) {
			throw e;
		}
	}
}

describe("Step concurrency config", () => {
	it("runs a step that references concurrency keys", async ({ expect }) => {
		const engineStub = await runWorkflow("KEYED-STEP", async (_event, step) => {
			const single = await step.do("single", keyed("k1"), async () => 1);
			const multi = await step.do("multi", keyed(["k1", "k2"]), async () => 2);
			return single + multi;
		});

		await waitForLog(engineStub, InstanceEvent.WORKFLOW_SUCCESS);
		const success = (await readLogs(engineStub)).find(
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
		const failure = (await readLogs(engineStub)).find(
			(log) => log.event === InstanceEvent.WORKFLOW_FAILURE
		);
		expect(failure?.metadata.error.message).toContain(
			'Step config for "dup" references concurrency key "k1" more than once'
		);
	});
});

describe("Step concurrency enforcement", () => {
	it("lets only `limit` steps hold a key at once", async ({ expect }) => {
		await concurrencyKeys().createKey("k", 1);
		let running = 0;
		let peak = 0;
		const gate = Promise.withResolvers<void>();

		const first = await runWorkflow("LIMIT-A", async (_event, step) => {
			await step.do("work", keyed("k"), async () => {
				running++;
				peak = Math.max(peak, running);
				await gate.promise;
				running--;
			});
		});
		await waitForUsage("k", { holding: 1, waiting: 0 });

		const second = await runWorkflow("LIMIT-B", async (_event, step) => {
			await step.do("work", keyed("k"), async () => {
				running++;
				peak = Math.max(peak, running);
				running--;
			});
		});
		await waitForLog(second, InstanceEvent.WAITING_FOR_STEP_CONCURRENCY);
		await waitForUsage("k", { holding: 1, waiting: 1 });
		expect(await second.getStatus()).toBe(InstanceStatus.Running);
		expect(
			(await readLogs(second)).some(
				(log) => log.event === InstanceEvent.STEP_START
			)
		).toBe(false);

		gate.resolve();
		await waitForLog(first, InstanceEvent.WORKFLOW_SUCCESS);
		await waitForLog(second, InstanceEvent.WORKFLOW_SUCCESS);
		expect(peak).toBe(1);
		await waitForUsage("k", { holding: 0, waiting: 0 });

		const waiting = (await readLogs(second)).find(
			(log) => log.event === InstanceEvent.WAITING_FOR_STEP_CONCURRENCY
		);
		expect(waiting).toMatchObject({
			target: "work-1",
			metadata: { keyName: "k", keys: ["k"] },
		});
		const claims = (await readLogs(second)).filter(
			(log) =>
				log.event === InstanceEvent.TICKET_CLAIMED ||
				log.event === InstanceEvent.TICKET_RELEASED
		);
		expect(claims.map((log) => log.event)).toEqual([
			InstanceEvent.TICKET_CLAIMED,
			InstanceEvent.TICKET_RELEASED,
		]);
	});

	it("acquires every key of a step or none of them", async ({ expect }) => {
		await concurrencyKeys().createKey("a", 1);
		await concurrencyKeys().createKey("b", 1);
		const holds = await concurrencyKeys().hold("b");

		const engineStub = await runWorkflow("MULTI-KEY", async (_event, step) => {
			await step.do("work", keyed(["a", "b"]), async () => "done");
		});
		await waitForUsage("b", { holding: 1, waiting: 1 });
		expect((await concurrencyKeys().getKey("a"))?.usage).toEqual({
			holding: 0,
			waiting: 0,
		});

		await concurrencyKeys().release(holds[0]);
		await waitForLog(engineStub, InstanceEvent.WORKFLOW_SUCCESS);
		await waitForUsage("a", { holding: 0, waiting: 0 });
	});

	it("runs a step without limit when its key does not exist", async ({
		expect,
	}) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const engineStub = await runWorkflow(
			"MISSING-KEY",
			async (_event, step) => {
				await step.do("first", keyed("missing"), async () => 1);
				await step.do("second", keyed("missing"), async () => 2);
			}
		);
		await waitForLog(engineStub, InstanceEvent.WORKFLOW_SUCCESS);
		const warnings = warn.mock.calls.filter(([message]) =>
			String(message).includes('Concurrency key "missing"')
		);
		warn.mockRestore();
		expect(warnings).toHaveLength(1);
		expect(
			(await readLogs(engineStub)).some(
				(log) => log.event === InstanceEvent.TICKET_CLAIMED
			)
		).toBe(false);
	});

	it("holds the key through retries and releases it on final failure", async ({
		expect,
	}) => {
		await concurrencyKeys().createKey("k", 1);
		const fail = Promise.withResolvers<void>();
		let attempts = 0;

		const engineStub = await runWorkflow("RETRY-HOLD", async (_event, step) => {
			await step.do(
				"flaky",
				keyed("k", { retries: { limit: 1, delay: 0 } }),
				async () => {
					attempts++;
					if (attempts === 2) {
						await fail.promise;
					}
					throw new Error("boom");
				}
			);
		});

		await vi.waitUntil(() => attempts === 2, { timeout: 5000 });
		expect((await concurrencyKeys().getKey("k"))?.usage.holding).toBe(1);
		fail.resolve();
		await waitForLog(engineStub, InstanceEvent.WORKFLOW_FAILURE);
		await waitForUsage("k", { holding: 0, waiting: 0 });
		expect(attempts).toBe(2);
	});

	it("releases the key when a step throws a NonRetryableError", async ({
		expect,
	}) => {
		await concurrencyKeys().createKey("k", 1);
		const engineStub = await runWorkflow(
			"NON-RETRYABLE",
			async (_event, step) => {
				await step.do("fatal", keyed("k"), async () => {
					throw new NonRetryableError("nope");
				});
			}
		);
		await waitForLog(engineStub, InstanceEvent.WORKFLOW_FAILURE);
		await waitForUsage("k", { holding: 0, waiting: 0 });
		expect(await statusOf(engineStub)).toBe(InstanceStatus.Errored);
	});

	it("keeps other branches running while a step waits", async ({ expect }) => {
		await concurrencyKeys().createKey("k", 1);
		const holds = await concurrencyKeys().hold("k");
		const order: string[] = [];

		const engineStub = await runWorkflow("BRANCHES", async (_event, step) => {
			await Promise.all([
				step.do("keyed", keyed("k"), async () => {
					order.push("keyed");
				}),
				(async () => {
					await step.do("b1", async () => order.push("b1"));
					await step.do("b2", async () => order.push("b2"));
				})(),
			]);
		});

		await vi.waitUntil(() => order.includes("b2"), { timeout: 5000 });
		expect(order).toEqual(["b1", "b2"]);
		await waitForUsage("k", { holding: 1, waiting: 1 });

		await concurrencyKeys().release(holds[0]);
		await waitForLog(engineStub, InstanceEvent.WORKFLOW_SUCCESS);
		expect(order).toEqual(["b1", "b2", "keyed"]);
	});

	it("wakes a waiting step when the key's limit is raised", async ({
		expect,
	}) => {
		await concurrencyKeys().createKey("k", 1);
		await concurrencyKeys().hold("k");
		const engineStub = await runWorkflow(
			"RAISE-LIMIT",
			async (_event, step) => {
				await step.do("work", keyed("k"), async () => "done");
			}
		);
		await waitForUsage("k", { holding: 1, waiting: 1 });

		await concurrencyKeys().updateKey("k", 2);
		await waitForLog(engineStub, InstanceEvent.WORKFLOW_SUCCESS);
		expect((await concurrencyKeys().getKey("k"))?.usage.holding).toBe(1);
	});

	it("lets waiting steps run once their key is deleted", async ({ expect }) => {
		await concurrencyKeys().createKey("k", 1);
		await concurrencyKeys().hold("k");
		const engineStub = await runWorkflow("DELETE-KEY", async (_event, step) => {
			await step.do("work", keyed("k"), async () => "done");
		});
		await waitForUsage("k", { holding: 1, waiting: 1 });

		await concurrencyKeys().deleteKey("k");
		await waitForLog(engineStub, InstanceEvent.WORKFLOW_SUCCESS);
		expect(await statusOf(engineStub)).toBe(InstanceStatus.Complete);
	});

	it("pauses a waiting step without granting it a slot", async ({ expect }) => {
		await concurrencyKeys().createKey("k", 1);
		const holds = await concurrencyKeys().hold("k");
		const engineStub = await runWorkflow(
			"PAUSE-WAITING",
			async (_event, step) => {
				await step.do("work", keyed("k"), async () => "done");
			}
		);
		await waitForUsage("k", { holding: 1, waiting: 1 });

		await changeStatus(engineStub, "pause");
		await vi.waitUntil(
			async () => (await engineStub.getStatus()) === InstanceStatus.Paused,
			{ timeout: 5000 }
		);
		await waitForUsage("k", { holding: 1, waiting: 0 });

		await concurrencyKeys().release(holds[0]);
		await changeStatus(engineStub, "resume");
		await waitForLog(engineStub, InstanceEvent.WORKFLOW_SUCCESS);
		expect(
			(await readLogs(engineStub)).filter(
				(log) => log.event === InstanceEvent.TICKET_CLAIMED
			)
		).toHaveLength(1);
	});

	it("releases the slots of a terminated instance", async ({ expect }) => {
		await concurrencyKeys().createKey("k", 1);
		const gate = Promise.withResolvers<void>();
		const engineStub = await runWorkflow("TERMINATE", async (_event, step) => {
			await step.do("work", keyed("k"), async () => {
				await gate.promise;
			});
		});
		await waitForUsage("k", { holding: 1, waiting: 0 });

		await changeStatus(engineStub, "terminate");
		await waitForUsage("k", { holding: 0, waiting: 0 });
		expect(await statusOf(engineStub)).toBe(InstanceStatus.Terminated);
		gate.resolve();
	});

	it("does not acquire keys for steps replayed from cache", async ({
		expect,
	}) => {
		await concurrencyKeys().createKey("k", 1);
		const instanceId = "REPLAY";
		const engineStub = await runWorkflow(instanceId, async (_event, step) => {
			await step.do("keyed", keyed("k"), async () => "cached");
			await step.waitForEvent("wait", { type: "go", timeout: "1 minute" });
		});
		await waitForLog(engineStub, InstanceEvent.WAIT_START);
		await concurrencyKeys().hold("k");

		await runInDurableObject(engineStub, (engine) =>
			engine.abort("restart")
		).catch(() => {}); // aborting the Durable Object rejects the call
		const restarted = env.ENGINE.get(env.ENGINE.idFromName(instanceId));
		await restarted.receiveEvent({
			type: "go",
			timestamp: new Date(),
			payload: {},
		});
		await waitForLog(restarted, InstanceEvent.WORKFLOW_SUCCESS);
		expect(
			(await readLogs(restarted)).filter(
				(log) => log.event === InstanceEvent.TICKET_CLAIMED
			)
		).toHaveLength(1);
	});
});

describe("ConcurrencyKeys", () => {
	it("rejects duplicate names and unknown keys", async ({ expect }) => {
		const created = await concurrencyKeys().createKey("k", 2);
		expect(created).toMatchObject({
			name: "k",
			limit: 2,
			usage: { holding: 0, waiting: 0 },
		});
		expect((await concurrencyKeys().getKey(created.id))?.name).toBe("k");

		expect(
			await errorMessage(() => concurrencyKeys().createKey("k", 1))
		).toContain("(concurrency_key.already_exists)");
		expect(
			await errorMessage(() => concurrencyKeys().updateKey("nope", 1))
		).toContain("(concurrency_key.not_found)");
		expect(
			await errorMessage(() => concurrencyKeys().deleteKey("nope"))
		).toContain("(concurrency_key.not_found)");
		expect(
			await errorMessage(() => concurrencyKeys().createKey("bad", 0))
		).toContain("positive integer");
		expect(
			await errorMessage(() => concurrencyKeys().createKey("", 1))
		).toContain("between 1 and 255");
	});

	it("keeps a deleted key's holders counted when it is re-created", async ({
		expect,
	}) => {
		await concurrencyKeys().createKey("k", 1);
		await concurrencyKeys().hold("k");
		await concurrencyKeys().deleteKey("k");
		const recreated = await concurrencyKeys().createKey("k", 1);
		expect(recreated.usage.holding).toBe(1);
	});

	it("gives tests an admin API that releases its holds on dispose", async ({
		expect,
	}) => {
		{
			using admin = new ConcurrencyKeysAdmin(concurrencyKeys());
			await admin.set("k", 1);
			await admin.set("k", 3);
			expect((await admin.get("k"))?.limit).toBe(3);
			await admin.hold("k", 2);
			expect((await admin.get("k"))?.usage.holding).toBe(2);
			expect(await admin.get("missing")).toBeNull();
		}
		await waitForUsage("k", { holding: 0, waiting: 0 });
	});

	it("waits until steps wait for a key", async ({ expect }) => {
		await concurrencyKeys().createKey("k", 1);
		await concurrencyKeys().hold("k");
		expect(
			await errorMessage(() => concurrencyKeys().waitForWaiters("k", 1, 50))
		).toContain("Timed out after 50ms");

		await runWorkflow("WAIT-FOR-WAITERS", async (_event, step) => {
			await step.do("work", keyed("k"), async () => "done");
		});
		await concurrencyKeys().waitForWaiters("k", 1, 5000);
		expect(await concurrencyKeys().listWaiters("k")).toMatchObject([
			{ instance_id: "WAIT-FOR-WAITERS", step: "work-1", blocked_on: "k" },
		]);
	});
});
