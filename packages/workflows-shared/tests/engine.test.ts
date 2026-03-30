import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { afterEach, describe, it, vi } from "vitest";
import workerdUnsafe from "workerd:unsafe";
import { DEFAULT_STEP_LIMIT, InstanceEvent, InstanceStatus } from "../src";
import { ABORT_REASONS, isAbortError } from "../src/lib/errors";
import { setTestWorkflowCallback } from "./test-entry";
import { runWorkflow, runWorkflowAndAwait } from "./utils";
import type {
	DatabaseInstance,
	DatabaseVersion,
	DatabaseWorkflow,
	EngineLogs,
} from "../src/engine";
import type { WorkflowStep } from "cloudflare:workers";

afterEach(async () => {
	await workerdUnsafe.abortAllDurableObjects();
});

describe("Engine", () => {
	it("should not retry after NonRetryableError is thrown", async ({
		expect,
	}) => {
		const instanceId = "NON-RETRYABLE-ERROR";
		const engineId = env.ENGINE.idFromName(instanceId);

		await runWorkflow(instanceId, async (_event, step) => {
			await step.do("should only have one retry", async () => {
				throw new NonRetryableError("Should only retry once");
			});
		});

		await vi.waitUntil(
			async () => {
				try {
					const logs = (await env.ENGINE.get(
						engineId
					).readLogs()) as EngineLogs;
					return logs.logs.some(
						(val) => val.event === InstanceEvent.WORKFLOW_FAILURE
					);
				} catch (e) {
					// DO may still be aborting — retry
					if (isAbortError(e)) {
						return false;
					}
					throw e;
				}
			},
			{ timeout: 3000 }
		);

		const logs = (await env.ENGINE.get(engineId).readLogs()) as EngineLogs;

		expect(
			logs.logs.filter((val) => val.event === InstanceEvent.ATTEMPT_START)
		).toHaveLength(1);
	});

	it("should not error out if step fails but is try-catched", async ({
		expect,
	}) => {
		const engineStub = await runWorkflow(
			"MOCK-INSTANCE-ID-TRY-CATCH",
			async (_event, step) => {
				try {
					await step.do(
						"always errors out",
						{
							retries: {
								limit: 0,
								delay: 1000,
							},
						},
						async () => {
							throw new Error("Step errors out");
						}
					);
				} catch {}
				return "finished";
			}
		);

		await vi.waitUntil(
			async () => {
				const logs = (await engineStub.readLogs()) as EngineLogs;
				return logs.logs.some(
					(val) => val.event == InstanceEvent.WORKFLOW_SUCCESS
				);
			},
			{ timeout: 1000 }
		);

		const logs = (await engineStub.readLogs()) as EngineLogs;

		expect(
			logs.logs.some((val) => val.event == InstanceEvent.WORKFLOW_SUCCESS)
		).toBe(true);

		expect(
			logs.logs.filter((val) => val.event == InstanceEvent.ATTEMPT_FAILURE)
		).toHaveLength(1);
	});

	// eslint-disable-next-line jest/expect-expect
	it("waitForEvent should receive events while active", async () => {
		const engineStub = await runWorkflow(
			"MOCK-INSTANCE-ID-WAIT-FOR-EVENT",
			async (_, step) => {
				return await step.waitForEvent("i'm a event!", {
					type: "event-type-1",
					timeout: "10 seconds",
				});
			}
		);

		await vi.waitUntil(async () => {
			const logs = (await engineStub.readLogs()) as EngineLogs;
			return logs.logs.filter((val) => val.event == InstanceEvent.WAIT_START);
		}, 500);

		await engineStub.receiveEvent({
			type: "event-type-1",
			timestamp: new Date(),
			payload: {},
		});

		await vi.waitUntil(async () => {
			const logs = (await engineStub.readLogs()) as EngineLogs;
			return logs.logs.filter(
				(val) => val.event == InstanceEvent.WORKFLOW_SUCCESS
			);
		}, 500);
	});

	// eslint-disable-next-line jest/expect-expect
	it("waitForEvent should receive events even if not active", async () => {
		const engineStub = await runWorkflow(
			"MOCK-INSTANCE-ID-WAIT-FOR-EVENT-NOT-ACTIVE",
			async (_, step) => {
				return await step.waitForEvent("i'm a event!", {
					type: "event-type-1",
					timeout: "10 seconds",
				});
			}
		);

		await vi.waitUntil(async () => {
			const logs = (await engineStub.readLogs()) as EngineLogs;
			return logs.logs.filter((val) => val.event == InstanceEvent.WAIT_START);
		}, 500);

		try {
			await runInDurableObject(engineStub, async (engine) => {
				await engine.abort("kabooom");
			});
		} catch {
			// supposed to error out
		}

		// Get a new stub since we've just aborted the durable object
		const newStub = env.ENGINE.get(
			env.ENGINE.idFromName("MOCK-INSTANCE-ID-WAIT-FOR-EVENT-NOT-ACTIVE")
		);

		await newStub.receiveEvent({
			type: "event-type-1",
			timestamp: new Date(),
			payload: {},
		});

		await vi.waitUntil(async () => {
			const logs = (await newStub.readLogs()) as EngineLogs;
			return logs.logs.filter(
				(val) => val.event == InstanceEvent.WORKFLOW_SUCCESS
			);
		}, 500);
	});

	it("waitForEvent should not deliver events to timed-out events with the same type", async ({
		expect,
	}) => {
		const instanceId = "WAIT-FOR-EVENT-STALE-WAITER";
		const engineStub = await runWorkflow(instanceId, async (_, step) => {
			const results: Array<{
				iteration: number;
				received: boolean;
			}> = [];

			for (let i = 1; i <= 3; i++) {
				try {
					await step.waitForEvent(`my-event-waiter-${i}`, {
						type: "my-event",
						timeout: 500,
					});
					results.push({ iteration: i, received: true });
				} catch {
					results.push({ iteration: i, received: false });
				}
			}

			return { results };
		});

		// 1st waitForEvent iteration - should receive event
		await vi.waitUntil(
			async () => {
				const logs = (await engineStub.readLogs()) as EngineLogs;
				return (
					logs.logs.filter((val) => val.event === InstanceEvent.WAIT_START)
						.length >= 1
				);
			},
			{ timeout: 500 }
		);

		await engineStub.receiveEvent({
			type: "my-event",
			timestamp: new Date(),
			payload: { iteration: 1 },
		});

		await vi.waitUntil(
			async () => {
				const logs = (await engineStub.readLogs()) as EngineLogs;
				return (
					logs.logs.filter((val) => val.event === InstanceEvent.WAIT_START)
						.length >= 2
				);
			},
			{ timeout: 500 }
		);

		// 2nd waitForEvent iteration - should timeout (500ms)
		await vi.waitUntil(
			async () => {
				const logs = (await engineStub.readLogs()) as EngineLogs;
				return logs.logs.some(
					(val) => val.event === InstanceEvent.WAIT_TIMED_OUT
				);
			},
			{ timeout: 1000 }
		);

		// 3rd waitForEvent iteration - should receive event
		await vi.waitUntil(
			async () => {
				const logs = (await engineStub.readLogs()) as EngineLogs;
				return (
					logs.logs.filter((val) => val.event === InstanceEvent.WAIT_START)
						.length >= 3
				);
			},
			{ timeout: 500 }
		);

		await engineStub.receiveEvent({
			type: "my-event",
			timestamp: new Date(),
			payload: { iteration: 3 },
		});

		await vi.waitUntil(
			async () => {
				const logs = (await engineStub.readLogs()) as EngineLogs;
				return logs.logs.some(
					(val) => val.event === InstanceEvent.WORKFLOW_SUCCESS
				);
			},
			{ timeout: 1000 }
		);

		const logs = (await engineStub.readLogs()) as EngineLogs;
		// Iterations 1 and 3 received events; iteration 2 timed out
		expect(
			logs.logs.filter((val) => val.event === InstanceEvent.WAIT_COMPLETE)
		).toHaveLength(2);
		expect(
			logs.logs.filter((val) => val.event === InstanceEvent.WAIT_TIMED_OUT)
		).toHaveLength(1);
	});

	it("should restore state from storage when accountId is undefined", async ({
		expect,
	}) => {
		const instanceId = "RESTORE-TEST-INSTANCE";
		const accountId = 12345;
		const workflow: DatabaseWorkflow = {
			name: "test-workflow",
			id: "workflow-123",
			created_on: new Date().toISOString(),
			modified_on: new Date().toISOString(),
			script_name: "test-script",
			class_name: "TestWorkflow",
			triggered_on: null,
		};
		const version: DatabaseVersion = {
			id: "version-123",
			class_name: "TestWorkflow",
			created_on: new Date().toISOString(),
			modified_on: new Date().toISOString(),
			workflow_id: workflow.id,
			mutable_pipeline_id: "pipeline-123",
		};
		const instance: DatabaseInstance = {
			id: instanceId,
			created_on: new Date().toISOString(),
			modified_on: new Date().toISOString(),
			workflow_id: workflow.id,
			version_id: version.id,
			status: InstanceStatus.Running,
			started_on: new Date().toISOString(),
			ended_on: null,
		};
		const event = {
			payload: {},
			timestamp: new Date(),
			instanceId: instanceId,
		};

		const engineStub = await runWorkflow(instanceId, async () => {
			return "test";
		});

		try {
			await runInDurableObject(engineStub, async (engine) => {
				await engine.init(accountId, workflow, version, instance, event);
				await engine.setStatus(accountId, instanceId, InstanceStatus.Running);
				await engine.abort(ABORT_REASONS.GRACE_PERIOD_COMPLETE);
			});
		} catch (e) {
			// Expected - abort throws to break the DO
			if (!isAbortError(e)) {
				throw e;
			}
		}

		const engineId = env.ENGINE.idFromName(instanceId);
		const restartedStub = env.ENGINE.get(engineId);

		const status = await runInDurableObject(restartedStub, (engine) => {
			return engine.getStatus();
		});

		expect(status).toBe(InstanceStatus.Running);

		const logs = (await restartedStub.readLogs()) as EngineLogs;
		expect(
			logs.logs.some((log) => log.event === InstanceEvent.WORKFLOW_START)
		).toBe(true);
	});

	describe("step limits", () => {
		it("should enforce step limit when exceeded", async ({ expect }) => {
			const stepLimit = 3;
			const instanceId = "STEP-LIMIT-EXCEEDED";
			const engineId = env.ENGINE.idFromName(instanceId);
			const engineStub = env.ENGINE.get(engineId);

			await runInDurableObject(engineStub, (engine) => {
				engine.stepLimit = stepLimit;
			});

			setTestWorkflowCallback(async (_event, step) => {
				for (let i = 0; i < stepLimit + 1; i++) {
					await step.do(`step-${i}`, async () => `result-${i}`);
				}
			});

			await engineStub.init(
				12346,
				{} as DatabaseWorkflow,
				{} as DatabaseVersion,
				{ id: instanceId } as DatabaseInstance,
				{ payload: {}, timestamp: new Date(), instanceId }
			);

			const logs = (await engineStub.readLogs()) as EngineLogs;

			expect(
				logs.logs.some((val) => val.event === InstanceEvent.WORKFLOW_FAILURE)
			).toBe(true);
		});

		it("should succeed when steps are exactly at the limit", async ({
			expect,
		}) => {
			const stepLimit = 3;
			const instanceId = "STEP-LIMIT-AT-LIMIT";
			const engineId = env.ENGINE.idFromName(instanceId);
			const engineStub = env.ENGINE.get(engineId);

			await runInDurableObject(engineStub, (engine) => {
				engine.stepLimit = stepLimit;
			});

			setTestWorkflowCallback(async (_event, step) => {
				for (let i = 0; i < stepLimit; i++) {
					await step.do(`step-${i}`, async () => `result-${i}`);
				}
				return "done";
			});

			await engineStub.init(
				12346,
				{} as DatabaseWorkflow,
				{} as DatabaseVersion,
				{ id: instanceId } as DatabaseInstance,
				{ payload: {}, timestamp: new Date(), instanceId }
			);

			const logs = (await engineStub.readLogs()) as EngineLogs;

			expect(
				logs.logs.some((val) => val.event === InstanceEvent.WORKFLOW_SUCCESS)
			).toBe(true);
			expect(
				logs.logs.some((val) => val.event === InstanceEvent.WORKFLOW_FAILURE)
			).toBe(false);
		});

		it("should use DEFAULT_STEP_LIMIT when no limit is configured", async ({
			expect,
		}) => {
			const engineId = env.ENGINE.idFromName("STEP-LIMIT-DEFAULT");
			const freshStub = env.ENGINE.get(engineId);

			const stepLimit = await runInDurableObject(
				freshStub,
				(engine) => engine.stepLimit
			);

			expect(stepLimit).toBe(DEFAULT_STEP_LIMIT);
		});
	});

	describe("lifecycle methods", () => {
		it.for([
			InstanceStatus.Complete,
			InstanceStatus.Errored,
			InstanceStatus.Terminated,
		])(
			"should throw when calling terminate on instance in finite state: %s",
			async (finiteStatus, { expect }) => {
				const engineStub = await runWorkflowAndAwait(
					`TERMINATE-${finiteStatus}-INSTANCE`,
					async () => "done"
				);

				// If not Complete, manually set the status
				if (finiteStatus !== InstanceStatus.Complete) {
					await runInDurableObject(engineStub, async (_engine, state) => {
						await state.storage.put("ENGINE_STATUS", finiteStatus);
					});
				}

				await expect(
					runInDurableObject(engineStub, async (engine) => {
						await engine.changeInstanceStatus("terminate");
					})
				).rejects.toThrow(
					"Cannot terminate instance since its on a finite state"
				);
			}
		);

		it.for([
			InstanceStatus.Complete,
			InstanceStatus.Errored,
			InstanceStatus.Terminated,
			InstanceStatus.Running,
			InstanceStatus.Paused,
		])(
			"should restart workflow from status: %s",
			async (initialStatus, { expect }) => {
				const instanceId = `RESTART-${initialStatus}-INSTANCE`;
				const engineId = env.ENGINE.idFromName(instanceId);

				const engineStub = await runWorkflowAndAwait(
					instanceId,
					async (_event: unknown, step: WorkflowStep) => {
						await step.do("test-step", async () => "step-result");
						return "done";
					}
				);

				// Set the status to initialStatus
				await runInDurableObject(engineStub, async (_engine, state) => {
					await state.storage.put("ENGINE_STATUS", initialStatus);
				});

				try {
					await runInDurableObject(engineStub, async (engine) => {
						await engine.changeInstanceStatus("restart");
					});
				} catch (e) {
					// Expected - abort throws to break the DO
					if (!isAbortError(e)) {
						throw e;
					}
				}

				const restartedStub = env.ENGINE.get(engineId);

				await runInDurableObject(restartedStub, async (engine) => {
					await engine.attemptRestart();
				});

				await vi.waitUntil(
					async () => {
						const status = await runInDurableObject(restartedStub, (engine) =>
							engine.getStatus()
						);
						return status === InstanceStatus.Complete;
					},
					{ timeout: 1000 }
				);

				// Verify the workflow ran again by checking logs
				const logs = (await restartedStub.readLogs()) as EngineLogs;

				expect(
					logs.logs.some((log) => log.event === InstanceEvent.WORKFLOW_START)
				).toBe(true);

				expect(
					logs.logs.some((log) => log.event === InstanceEvent.STEP_START)
				).toBe(true);

				expect(
					logs.logs.some((log) => log.event === InstanceEvent.WORKFLOW_SUCCESS)
				).toBe(true);
			}
		);

		it("should pause after in-flight step.do finishes", async ({ expect }) => {
			const instanceId = "PAUSE-AFTER-DO";
			const engineId = env.ENGINE.idFromName(instanceId);

			const engineStub = await runWorkflow(instanceId, async (_event, step) => {
				await step.do("long-step", async () => {
					await scheduler.wait(500);
					return "first";
				});
				// step-2 should never run because pause takes effect after long-step
				await step.do("step-2", async () => "second");
				return "done";
			});

			// Wait for long-step to start
			await vi.waitUntil(
				async () => {
					return await runInDurableObject(engineStub, (engine) => {
						const logs = engine.readLogs() as unknown as EngineLogs;
						return logs.logs.some(
							(log) => log.event === InstanceEvent.STEP_START
						);
					});
				},
				{ timeout: 1000 }
			);

			// Request pause while long-step is in flight
			try {
				await runInDurableObject(engineStub, async (engine) => {
					await engine.changeInstanceStatus("pause");
				});
			} catch (e) {
				if (!isAbortError(e)) {
					throw e;
				}
			}

			await vi.waitUntil(
				async () => {
					try {
						return await runInDurableObject(
							env.ENGINE.get(engineId),
							async (engine) =>
								(await engine.getStatus()) === InstanceStatus.Paused
						);
					} catch (e) {
						if (isAbortError(e)) {
							return false;
						}
						throw e;
					}
				},
				{ timeout: 2000 }
			);

			const freshStub = env.ENGINE.get(engineId);
			const finalStatus = await runInDurableObject(freshStub, (engine) =>
				engine.getStatus()
			);
			expect(finalStatus).toBe(InstanceStatus.Paused);

			// Verify long-step completed but step-2 never ran
			const logs = await runInDurableObject(freshStub, (engine) => {
				return engine.readLogs() as unknown as EngineLogs;
			});
			const stepSuccesses = logs.logs.filter(
				(log) => log.event === InstanceEvent.STEP_SUCCESS
			);
			expect(stepSuccesses).toHaveLength(1);
		});

		it("should pause after multiple concurrent in-flight step.dos finish", async ({
			expect,
		}) => {
			const instanceId = "PAUSE-AFTER-CONCURRENT-DOS";
			const engineId = env.ENGINE.idFromName(instanceId);

			const engineStub = await runWorkflow(instanceId, async (_event, step) => {
				const [resultA, resultB] = await Promise.all([
					step.do("slow-step-a", async () => {
						await scheduler.wait(500);
						return "a-done";
					}),
					step.do("slow-step-b", async () => {
						await scheduler.wait(500);
						return "b-done";
					}),
				]);

				// This step should never run
				await step.do("step-after-pause", async () => "should-not-run");
				return { resultA, resultB };
			});

			await vi.waitUntil(
				async () => {
					return await runInDurableObject(engineStub, (engine) => {
						const logs = engine.readLogs() as unknown as EngineLogs;
						return (
							logs.logs.filter((log) => log.event === InstanceEvent.STEP_START)
								.length >= 2
						);
					});
				},
				{ timeout: 1000 }
			);

			// Request pause while both slow steps are in flight
			try {
				await runInDurableObject(engineStub, async (engine) => {
					await engine.changeInstanceStatus("pause");
				});
			} catch (e) {
				if (!isAbortError(e)) {
					throw e;
				}
			}

			await vi.waitUntil(
				async () => {
					try {
						return await runInDurableObject(
							env.ENGINE.get(engineId),
							async (engine) =>
								(await engine.getStatus()) === InstanceStatus.Paused
						);
					} catch (e) {
						if (isAbortError(e)) {
							return false;
						}
						throw e;
					}
				},
				{ timeout: 2000 }
			);

			const freshStub = env.ENGINE.get(engineId);
			const finalStatus = await runInDurableObject(freshStub, (engine) =>
				engine.getStatus()
			);
			expect(finalStatus).toBe(InstanceStatus.Paused);

			// Both concurrent steps should have completed, but step-after-pause should not
			const logs = await runInDurableObject(freshStub, (engine) => {
				return engine.readLogs() as unknown as EngineLogs;
			});
			const stepSuccesses = logs.logs.filter(
				(log) => log.event === InstanceEvent.STEP_SUCCESS
			);
			expect(stepSuccesses).toHaveLength(2);
		});

		it("should unblock concurrent steps blocked when resume cancels pending pause", async ({
			expect,
		}) => {
			const instanceId = "RESUME-UNBLOCKS-WAITING-STEPS";
			const engineId = env.ENGINE.idFromName(instanceId);

			const engineStub = await runWorkflow(instanceId, async (_event, step) => {
				const [slowResult, fastResult] = await Promise.all([
					step.do("slow-step", async () => {
						await scheduler.wait(1000);
						return "slow-done";
					}),
					step.do("fast-step", async () => {
						return "fast-done";
					}),
				]);

				await step.do("step-after-resume", async () => "after-resume");
				return { slowResult, fastResult };
			});

			await vi.waitUntil(
				async () => {
					return await runInDurableObject(engineStub, (engine) => {
						const logs = engine.readLogs() as unknown as EngineLogs;
						return logs.logs.some(
							(log) => log.event === InstanceEvent.STEP_START
						);
					});
				},
				{ timeout: 1000 }
			);

			await runInDurableObject(engineStub, async (engine) => {
				await engine.changeInstanceStatus("pause");
			});

			await vi.waitUntil(
				async () =>
					runInDurableObject(
						env.ENGINE.get(engineId),
						async (engine) =>
							(await engine.getStatus()) === InstanceStatus.WaitingForPause
					),
				{ timeout: 1000 }
			);

			// Resume before slow-step finishes
			await runInDurableObject(engineStub, async (engine) => {
				await engine.changeInstanceStatus("resume");
			});

			// Verify status goes back to Running
			const statusAfterResume = await runInDurableObject(
				env.ENGINE.get(engineId),
				(engine) => engine.getStatus()
			);
			expect(statusAfterResume).toBe(InstanceStatus.Running);

			await vi.waitUntil(
				async () =>
					runInDurableObject(
						env.ENGINE.get(engineId),
						async (engine) =>
							(await engine.getStatus()) === InstanceStatus.Complete
					),
				{ timeout: 5000 }
			);

			const freshStub = env.ENGINE.get(engineId);
			const finalStatus = await runInDurableObject(freshStub, (engine) =>
				engine.getStatus()
			);
			expect(finalStatus).toBe(InstanceStatus.Complete);

			// All three steps should have completed
			const logs = await runInDurableObject(freshStub, (engine) => {
				return engine.readLogs() as unknown as EngineLogs;
			});
			const stepSuccesses = logs.logs.filter(
				(log) => log.event === InstanceEvent.STEP_SUCCESS
			);
			expect(stepSuccesses).toHaveLength(3);
		});

		it("should pause during a step.sleep, then resume and complete", async ({
			expect,
		}) => {
			const instanceId = "PAUSE-DURING-SLEEP-RESUME";
			const engineId = env.ENGINE.idFromName(instanceId);

			const engineStub = await runWorkflow(instanceId, async (_event, step) => {
				await step.do("first-step", async () => "first-done");

				await step.sleep("short-sleep", "1 second");

				await step.do("after-sleep", async () => "after-sleep-done");
				return "done";
			});

			// Wait for the first step to complete (workflow is now in the sleep)
			await vi.waitUntil(
				async () => {
					try {
						return await runInDurableObject(engineStub, (engine) => {
							const logs = engine.readLogs() as unknown as EngineLogs;
							return logs.logs.some(
								(log) => log.event === InstanceEvent.STEP_SUCCESS
							);
						});
					} catch (e) {
						if (isAbortError(e)) {
							return false;
						}
						throw e;
					}
				},
				{ timeout: 1000 }
			);

			// Request pause while in step.sleep — should pause immediately
			try {
				await runInDurableObject(engineStub, async (engine) => {
					await engine.changeInstanceStatus("pause");
				});
			} catch (e) {
				if (!isAbortError(e)) {
					throw e;
				}
			}

			await vi.waitUntil(
				async () => {
					try {
						return await runInDurableObject(
							env.ENGINE.get(engineId),
							async (engine) =>
								(await engine.getStatus()) === InstanceStatus.Paused
						);
					} catch (e) {
						if (isAbortError(e)) {
							return false;
						}
						throw e;
					}
				},
				{ timeout: 2000 }
			);

			expect(
				await runInDurableObject(env.ENGINE.get(engineId), (engine) =>
					engine.getStatus()
				)
			).toBe(InstanceStatus.Paused);

			// Only the first step should have succeeded — sleep was interrupted
			const logsBeforeResume = await runInDurableObject(
				env.ENGINE.get(engineId),
				(engine) => engine.readLogs() as unknown as EngineLogs
			);
			expect(
				logsBeforeResume.logs.filter(
					(log) => log.event === InstanceEvent.STEP_SUCCESS
				)
			).toHaveLength(1);

			// Resume the workflow
			try {
				await runInDurableObject(env.ENGINE.get(engineId), async (engine) => {
					await engine.changeInstanceStatus("resume");
				});
			} catch (e) {
				if (!isAbortError(e)) {
					throw e;
				}
			}

			// Wait for the workflow to complete — sleep should finish and after-sleep step should run
			await vi.waitUntil(
				async () => {
					try {
						return await runInDurableObject(
							env.ENGINE.get(engineId),
							async (engine) =>
								(await engine.getStatus()) === InstanceStatus.Complete
						);
					} catch (e) {
						if (isAbortError(e)) {
							return false;
						}
						throw e;
					}
				},
				{ timeout: 5000 }
			);

			const finalLogs = await runInDurableObject(
				env.ENGINE.get(engineId),
				(engine) => engine.readLogs() as unknown as EngineLogs
			);
			const stepSuccesses = finalLogs.logs.filter(
				(log) => log.event === InstanceEvent.STEP_SUCCESS
			);
			// first-step + after-sleep = 2 step successes
			expect(stepSuccesses).toHaveLength(2);
		});

		it("should pause during a waitForEvent, then resume and complete", async ({
			expect,
		}) => {
			const instanceId = "PAUSE-DURING-WAIT-FOR-EVENT";
			const engineId = env.ENGINE.idFromName(instanceId);

			const engineStub = await runWorkflow(instanceId, async (_event, step) => {
				await step.do("first-step", async () => "first-done");

				await step.waitForEvent("wait-for-signal", {
					type: "continue",
					timeout: "30 seconds",
				});

				await step.do("after-event", async () => "after-event-done");
				return "done";
			});

			// Wait for the first step to complete (workflow is now waiting for event)
			await vi.waitUntil(
				async () => {
					try {
						return await runInDurableObject(engineStub, (engine) => {
							const logs = engine.readLogs() as unknown as EngineLogs;
							return logs.logs.some(
								(log) => log.event === InstanceEvent.WAIT_START
							);
						});
					} catch (e) {
						if (isAbortError(e)) {
							return false;
						}
						throw e;
					}
				},
				{ timeout: 1000 }
			);

			// Request pause while in waitForEvent
			try {
				await runInDurableObject(engineStub, async (engine) => {
					await engine.changeInstanceStatus("pause");
				});
			} catch (e) {
				if (!isAbortError(e)) {
					throw e;
				}
			}

			await vi.waitUntil(
				async () => {
					try {
						return await runInDurableObject(
							env.ENGINE.get(engineId),
							async (engine) =>
								(await engine.getStatus()) === InstanceStatus.Paused
						);
					} catch (e) {
						if (isAbortError(e)) {
							return false;
						}
						throw e;
					}
				},
				{ timeout: 2000 }
			);

			expect(
				await runInDurableObject(env.ENGINE.get(engineId), (engine) =>
					engine.getStatus()
				)
			).toBe(InstanceStatus.Paused);

			// Resume the workflow
			try {
				await runInDurableObject(env.ENGINE.get(engineId), async (engine) => {
					await engine.changeInstanceStatus("resume");
				});
			} catch (e) {
				if (!isAbortError(e)) {
					throw e;
				}
			}

			// Send the event after resume
			await runInDurableObject(env.ENGINE.get(engineId), async (engine) => {
				await engine.receiveEvent({
					timestamp: new Date(),
					payload: { done: true },
					type: "continue",
				});
			});

			// Wait for the workflow to complete
			await vi.waitUntil(
				async () => {
					try {
						return await runInDurableObject(
							env.ENGINE.get(engineId),
							async (engine) =>
								(await engine.getStatus()) === InstanceStatus.Complete
						);
					} catch (e) {
						if (isAbortError(e)) {
							return false;
						}
						throw e;
					}
				},
				{ timeout: 5000 }
			);

			const finalLogs = await runInDurableObject(
				env.ENGINE.get(engineId),
				(engine) => engine.readLogs() as unknown as EngineLogs
			);
			const stepSuccesses = finalLogs.logs.filter(
				(log) => log.event === InstanceEvent.STEP_SUCCESS
			);
			// first-step + after-event = 2 step successes
			expect(stepSuccesses).toHaveLength(2);
		});

		it("should transition WaitingForPause to Paused on init() entry", async ({
			expect,
		}) => {
			const instanceId = "WAITING-FOR-PAUSE-INIT";

			const engineStub = await runWorkflowAndAwait(
				instanceId,
				async () => "done"
			);

			// Manually set status to WaitingForPause (simulating a DO restart scenario)
			await runInDurableObject(engineStub, async (_engine, state) => {
				await state.storage.put(
					"ENGINE_STATUS",
					InstanceStatus.WaitingForPause
				);
			});

			// Now call init() — it should detect WaitingForPause and transition to Paused
			await runInDurableObject(engineStub, async (engine) => {
				// Reset isRunning so init() doesn't short-circuit
				engine.isRunning = false;
				await engine.init(
					12346,
					{} as DatabaseWorkflow,
					{} as DatabaseVersion,
					{ id: instanceId } as DatabaseInstance,
					{
						payload: {},
						timestamp: new Date(),
						instanceId,
					}
				);
			});

			const status = await runInDurableObject(engineStub, (engine) =>
				engine.getStatus()
			);
			expect(status).toBe(InstanceStatus.Paused);
		});
	});
});
