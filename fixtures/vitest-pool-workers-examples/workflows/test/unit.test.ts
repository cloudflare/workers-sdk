import {
	env,
	introspectWorkflow,
	introspectWorkflowInstance,
} from "cloudflare:test";
import {
	afterEach,
	assert,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const INSTANCE_ID = "12345678910";
let instance: Awaited<ReturnType<typeof introspectWorkflowInstance>>;

const STEP_NAME = "my step";

describe("Long Workflow instance creation unit tests", () => {
	beforeEach(async () => {
		instance = await introspectWorkflowInstance(
			env.TEST_LONG_WORKFLOW,
			INSTANCE_ID
		);
	});

	afterEach(async () => {
		// Instance introspectors should be clean to prevent persisted state across tests
		await instance.cleanUp();
	});

	it("should disable all sleeps and complete instantly", async () => {
		await instance.modify(async (m) => {
			await m.disableSleeps();
		});

		await vi.waitUntil(
			async () => {
				const createdInstance = await env.TEST_LONG_WORKFLOW.create({
					id: INSTANCE_ID,
				});

				await instance.waitForStatus("complete");
				return (await createdInstance.status()).status === "complete";
			},
			{
				// running under 50ms confirms that sleeps were disabled
				timeout: 50,
				interval: 50,
			}
		);
	});

	it("should disable a set of sleeps and complete", async () => {
		await instance.modify(async (m) => {
			// disabling all sleeps either way to make test run fast
			await m.disableSleeps([
				{ name: "sleep for a while", index: 1 },
				{ name: "sleep for a while", index: 2 },
				{ name: "sleep for a day" },
			]);
		});

		await env.TEST_LONG_WORKFLOW.create({
			id: INSTANCE_ID,
		});

		await instance.waitForStatus("complete");
	});

	it("should be able to mock step result and complete", async () => {
		const mockResult = "a mocked result!";
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		await env.TEST_LONG_WORKFLOW.create({ id: INSTANCE_ID });

		expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
			mockResult
		);
		await instance.waitForStatus("complete");
	});

	it("should not be able to mock the same step result more than one time", async () => {
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.mockStepResult({ name: STEP_NAME }, "first mocked result");
			await expect(
				m.mockStepResult({ name: STEP_NAME }, "second mocked result")
			).rejects.toMatchInlineSnapshot(
				`[Error: [WorkflowIntrospector] Trying to mock step 'my step' multiple times!]`
			);
		});
	});

	it("should be able to mock step error in every retry and error", async () => {
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.mockStepError({ name: STEP_NAME }, new Error("Oops"));
		});

		await vi.waitUntil(
			async () => {
				const createdInstance = await env.TEST_LONG_WORKFLOW.create({
					id: INSTANCE_ID,
				});

				await expect(
					instance.waitForStepResult({ name: STEP_NAME })
				).rejects.toThrow();
				await instance.waitForStatus("errored");
				return (await createdInstance.status()).status === "errored";
			},
			{
				// config has 5 retires, all 50ms appart
				// should run in a bit over 250ms
				timeout: 300,
				interval: 300,
			}
		);
	});

	it("should be able to mock step error in the first 2 retries, then mock step result and complete", async () => {
		const mockResult = { result: "mocked" };
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.mockStepError({ name: STEP_NAME }, new Error("Oops"), 2);
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		await vi.waitUntil(
			async () => {
				const createdInstance = await env.TEST_LONG_WORKFLOW.create({
					id: INSTANCE_ID,
				});

				expect(
					instance.waitForStepResult({ name: STEP_NAME })
				).resolves.toEqual(mockResult);
				await instance.waitForStatus("complete");
				return (await createdInstance.status()).status === "complete";
			},
			{
				// config has 5 retires, all 50ms appart
				// with 2 retires, should run in a bit over 100ms
				timeout: 150,
				interval: 150,
			}
		);
	});

	it("should be able to mock step timeout in every retry and error", async () => {
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.forceStepTimeout({ name: STEP_NAME });
		});

		await vi.waitUntil(
			async () => {
				const createdInstance = await env.TEST_LONG_WORKFLOW.create({
					id: INSTANCE_ID,
				});

				await expect(
					instance.waitForStepResult({ name: STEP_NAME })
				).rejects.toThrow();
				await instance.waitForStatus("errored");
				return (await createdInstance.status()).status === "errored";
			},
			{
				// config has 5 retires, all 50ms appart
				// should run in a bit over 250ms
				timeout: 300,
				interval: 300,
			}
		);
	});

	it("should be able to mock step timeout in first retry, then mock step result and complete", async () => {
		const mockResult = { result: "mocked result" };
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.forceStepTimeout({ name: STEP_NAME }, 1);
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		await vi.waitUntil(
			async () => {
				const createdInstance = await env.TEST_LONG_WORKFLOW.create({
					id: INSTANCE_ID,
				});

				expect(
					instance.waitForStepResult({ name: STEP_NAME })
				).resolves.toEqual(mockResult);
				await instance.waitForStatus("complete");
				return (await createdInstance.status()).status === "complete";
			},
			{
				// config has 5 retires, all 50ms appart
				// should run in a bit over 50ms
				timeout: 100,
				interval: 100,
			}
		);
	});

	it("should be able to mock step timeout in first retry, mock error in the second retry and then mock step result and complete", async () => {
		const mockResult = { result: "mocked result" };
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.forceStepTimeout({ name: STEP_NAME }, 1);
			await m.mockStepError({ name: STEP_NAME }, new Error("Oops"), 1);
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		await vi.waitUntil(
			async () => {
				const createdInstance = await env.TEST_LONG_WORKFLOW.create({
					id: INSTANCE_ID,
				});

				expect(
					instance.waitForStepResult({ name: STEP_NAME })
				).resolves.toEqual(mockResult);
				await instance.waitForStatus("complete");
				return (await createdInstance.status()).status === "complete";
			},
			{
				// config has 5 retires, all 50ms appart
				// should run in a bit over 100ms
				timeout: 150,
				interval: 150,
			}
		);
	});

	it("should be able to mock an event and complete", async () => {
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.mockEvent({ type: "event", payload: { data: "mocked" } });
		});

		await vi.waitUntil(
			async () => {
				const createdInstance = await env.TEST_LONG_WORKFLOW.create({
					id: INSTANCE_ID,
					params: "run event",
				});

				await instance.waitForStatus("complete");
				return (await createdInstance.status()).status === "complete";
			},
			{
				// running under 50ms confirms that the event was moked (and sleeps were disabled)
				timeout: 50,
				interval: 50,
			}
		);
	});

	it("should be able to force an event to time out and error", async () => {
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.forceEventTimeout({ name: "my event" });
		});

		await vi.waitUntil(
			async () => {
				const createdInstance = await env.TEST_LONG_WORKFLOW.create({
					id: INSTANCE_ID,
					params: "run event",
				});

				await instance.waitForStatus("errored");
				return (await createdInstance.status()).status === "errored";
			},
			{
				// running under 50ms confirms that the event was forced to time out (and sleeps were disabled)
				timeout: 50,
				interval: 50,
			}
		);
	});

	it("should not be able to force an event to time out and complete", async () => {
		await instance.modify(async (m) => {
			await m.disableSleeps();
			await m.forceEventTimeout({ name: "my event" });
		});

		await env.TEST_LONG_WORKFLOW.create({
			id: INSTANCE_ID,
			params: "run event",
		});

		await expect(
			instance.waitForStatus("complete")
		).rejects.toMatchInlineSnapshot(
			`[Error: [WorkflowIntrospector] The Wokflow instance 12345678910 has reached status 'errored'. This is a finite status that prevents it from ever reaching the expected status of 'complete'.]`
		);
	});
});

let introspector: Awaited<ReturnType<typeof introspectWorkflow>>;
let instances: Awaited<ReturnType<typeof introspectWorkflowInstance>>[];

describe("Long Workflow BATCH creation unit tests", () => {
	beforeEach(async () => {
		introspector = await introspectWorkflow(env.TEST_LONG_WORKFLOW);
	});

	afterEach(async () => {
		// Instance introspectors should be clean to prevent persisted state across tests
		for (const instance of instances) {
			instance.cleanUp();
		}

		// Workflow introspector should be cleaned at the end of/after each test
		introspector.cleanUp();
	});

	it("should disable all sleeps and complete instantly", async () => {
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
		});

		await vi.waitUntil(
			async () => {
				// batch with 3 instances, one with provided id
				const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
					{},
					{},
					{
						id: INSTANCE_ID,
					},
				]);

				instances = introspector.get();
				console.log("INSTANCES HELP AAAA", instances);
				assert(instances.length === 3);

				for (const instance of instances) {
					await instance.waitForStatus("complete");
				}

				return (
					await Promise.all(
						createdInstances.map((instance) => instance.status())
					)
				).every((s) => s.status === "complete");
			},
			{
				// running under 100ms confirms that sleeps were disabled
				timeout: 100,
				interval: 100,
			}
		);
	});

	it("should disable a set of sleeps and complete", async () => {
		introspector.modifyAll(async (m) => {
			// disabling all sleeps either way to make test run fast
			await m.disableSleeps([
				{ name: "sleep for a while", index: 1 },
				{ name: "sleep for a while", index: 2 },
				{ name: "sleep for a day" },
			]);
		});

		// batch with 3 instances, one with provided id
		await env.TEST_LONG_WORKFLOW.createBatch([
			{},
			{},
			{
				id: INSTANCE_ID,
			},
		]);

		instances = introspector.get();
		assert(instances.length === 3);

		for (const instance of instances) {
			await instance.waitForStatus("complete");
		}
	});

	it("should be able to mock step result and complete", async () => {
		const mockResult = "a mocked result!";
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		// batch with 3 instances, one with provided id
		await env.TEST_LONG_WORKFLOW.createBatch([
			{},
			{},
			{
				id: INSTANCE_ID,
			},
		]);

		instances = introspector.get();
		assert(instances.length === 3);

		for (const instance of instances) {
			expect(await instance.waitForStepResult({ name: STEP_NAME })).toEqual(
				mockResult
			);
			await instance.waitForStatus("complete");
		}
	});

	it("should not be able to mock the same step result more than one time", async () => {
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.mockStepResult({ name: STEP_NAME }, "first mocked result");
			await expect(
				m.mockStepResult({ name: STEP_NAME }, "second mocked result")
			).rejects.toMatchInlineSnapshot(
				`[Error: [WorkflowIntrospector] Trying to mock step 'my step' multiple times!]`
			);
		});
	});

	it("should be able to mock step error in every retry and error", async () => {
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.mockStepError({ name: STEP_NAME }, new Error("Oops"));
		});

		await vi.waitUntil(
			async () => {
				// batch with 3 instances, one with provided id
				const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
					{},
					{},
					{
						id: INSTANCE_ID,
					},
				]);

				instances = introspector.get();
				assert(instances.length === 3);

				for (const instance of instances) {
					await expect(
						instance.waitForStepResult({ name: STEP_NAME })
					).rejects.toThrow();
					await instance.waitForStatus("errored");
				}

				return (
					await Promise.all(
						createdInstances.map((instance) => instance.status())
					)
				).every((s) => s.status === "errored");
			},
			{
				// config has 5 retires, all 50ms appart
				// should run in a bit over 250ms
				timeout: 350,
				interval: 350,
			}
		);
	});

	it("should be able to mock step error in the first 2 retries, then mock step result and complete", async () => {
		const mockResult = { result: "mocked" };
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.mockStepError({ name: STEP_NAME }, new Error("Oops"), 2);
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		await vi.waitUntil(
			async () => {
				// batch with 3 instances, one with provided id
				const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
					{},
					{},
					{
						id: INSTANCE_ID,
					},
				]);

				instances = introspector.get();
				assert(instances.length === 3);

				for (const instance of instances) {
					expect(
						instance.waitForStepResult({ name: STEP_NAME })
					).resolves.toEqual(mockResult);
					await instance.waitForStatus("complete");
				}

				return (
					await Promise.all(
						createdInstances.map((instance) => instance.status())
					)
				).every((s) => s.status === "complete");
			},
			{
				// config has 5 retires, all 50ms appart
				// with 2 retires, should run in a bit over 100ms
				timeout: 150,
				interval: 150,
			}
		);
	});

	it("should be able to mock step timeout in every retry and error", async () => {
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.forceStepTimeout({ name: STEP_NAME });
		});

		await vi.waitUntil(
			async () => {
				// batch with 3 instances, one with provided id
				const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
					{},
					{},
					{
						id: INSTANCE_ID,
					},
				]);

				instances = introspector.get();
				assert(instances.length === 3);

				for (const instance of instances) {
					await expect(
						instance.waitForStepResult({ name: STEP_NAME })
					).rejects.toThrow();
					await instance.waitForStatus("errored");
				}

				return (
					await Promise.all(
						createdInstances.map((instance) => instance.status())
					)
				).every((s) => s.status === "errored");
			},
			{
				// config has 5 retires, all 50ms appart
				// should run in a bit over 250m
				timeout: 350,
				interval: 350,
			}
		);
	});

	it("should be able to mock step timeout in first retry, then mock step result and complete", async () => {
		const mockResult = { result: "mocked result" };
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.forceStepTimeout({ name: STEP_NAME }, 1);
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		await vi.waitUntil(
			async () => {
				// batch with 3 instances, one with provided id
				const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
					{},
					{},
					{
						id: INSTANCE_ID,
					},
				]);

				instances = introspector.get();
				assert(instances.length === 3);

				for (const instance of instances) {
					expect(
						instance.waitForStepResult({ name: STEP_NAME })
					).resolves.toEqual(mockResult);
					await instance.waitForStatus("complete");
				}

				return (
					await Promise.all(
						createdInstances.map((instance) => instance.status())
					)
				).every((s) => s.status === "complete");
			},
			{
				// config has 5 retires, all 50ms appart
				// should run in a bit over 50ms
				timeout: 100,
				interval: 100,
			}
		);
	});

	it("should be able to mock step timeout in first retry, mock error in the second retry and then mock step result and complete", async () => {
		const mockResult = { result: "mocked result" };
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.forceStepTimeout({ name: STEP_NAME }, 1);
			await m.mockStepError({ name: STEP_NAME }, new Error("Oops"), 1);
			await m.mockStepResult({ name: STEP_NAME }, mockResult);
		});

		await vi.waitUntil(
			async () => {
				// batch with 3 instances, one with provided id
				const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
					{},
					{},
					{
						id: INSTANCE_ID,
					},
				]);

				instances = introspector.get();
				assert(instances.length === 3);

				for (const instance of instances) {
					expect(
						instance.waitForStepResult({ name: STEP_NAME })
					).resolves.toEqual(mockResult);
					await instance.waitForStatus("complete");
				}

				return (
					await Promise.all(
						createdInstances.map((instance) => instance.status())
					)
				).every((s) => s.status === "complete");
			},
			{
				// config has 5 retires, all 50ms appart
				// should run in a bit over 100ms
				timeout: 150,
				interval: 150,
			}
		);
	});

	it("should be able to mock an event and complete", async () => {
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.mockEvent({ type: "event", payload: { data: "mocked" } });
		});

		await vi.waitUntil(
			async () => {
				// batch with 3 instances, one with provided id
				const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
					{ params: "run event" },
					{ params: "run event" },
					{
						id: INSTANCE_ID,
						params: "run event",
					},
				]);

				instances = introspector.get();
				assert(instances.length === 3);

				for (const instance of instances) {
					await instance.waitForStatus("complete");
				}

				return (
					await Promise.all(
						createdInstances.map((instance) => instance.status())
					)
				).every((s) => s.status === "complete");
			},
			{
				// running under 50ms confirms that the event was moked (and sleeps were disabled)
				timeout: 50,
				interval: 50,
			}
		);
	});

	it("should be able to force an event to time out and error", async () => {
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.forceEventTimeout({ name: "my event" });
		});

		await vi.waitUntil(
			async () => {
				// batch with 3 instances, one with provided id
				const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
					{ params: "run event" },
					{ params: "run event" },
					{
						id: INSTANCE_ID,
						params: "run event",
					},
				]);

				instances = introspector.get();
				assert(instances.length === 3);

				for (const instance of instances) {
					await instance.waitForStatus("errored");
				}

				return (
					await Promise.all(
						createdInstances.map((instance) => instance.status())
					)
				).every((s) => s.status === "errored");
			},
			{
				// running under 50ms confirms that the event was forced to time out (and sleeps were disabled)
				timeout: 50,
				interval: 50,
			}
		);
	});

	it("should not be able to force an event to time out and complete", async () => {
		introspector.modifyAll(async (m) => {
			await m.disableSleeps();
			await m.forceEventTimeout({ name: "my event" });
		});

		// batch with 3 instances, one with provided id
		const createdInstances = await env.TEST_LONG_WORKFLOW.createBatch([
			{
				id: INSTANCE_ID,
				params: "run event",
			},
		]);

		instances = introspector.get();
		assert(instances.length === 1);

		for (const instance of instances) {
			await expect(
				instance.waitForStatus("complete")
			).rejects.toMatchInlineSnapshot(
				`[Error: [WorkflowIntrospector] The Wokflow instance 12345678910 has reached status 'errored'. This is a finite status that prevents it from ever reaching the expected status of 'complete'.]`
			);
		}
	});
});
