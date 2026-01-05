import { Miniflare, QUEUES_PLUGIN_NAME, Response } from "miniflare";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { MiniflareDurableObjectControlStub, TestLog } from "../../test-shared";

const StringArraySchema = z.string().array();

async function getControlStub(
	mf: Miniflare,
	queueName: string
): Promise<MiniflareDurableObjectControlStub> {
	const objectNamespace = await mf._getInternalDurableObjectNamespace(
		QUEUES_PLUGIN_NAME,
		"queues:queue",
		"QueueBrokerObject"
	);
	const objectId = objectNamespace.idFromName(queueName);
	const objectStub = objectNamespace.get(objectId);
	const stub = new MiniflareDurableObjectControlStub(objectStub);
	await stub.enableFakeTimers(1_000_000);
	return stub;
}

describe.sequential("Queues: retry", () => {
	let batches: string[][] = [];
	let mf: Miniflare;
	let object: MiniflareDurableObjectControlStub;

	beforeEach(async () => {
		batches = [];

		mf = new Miniflare({
			log: new TestLog(),
			verbose: true,
			queueProducers: { QUEUE: { queueName: "QUEUE" } },
			queueConsumers: {
				QUEUE: { retryDelay: 5, maxRetries: 2, maxBatchTimeout: 0 },
			},
			serviceBindings: {
				async REPORTER(request) {
					const batch = StringArraySchema.parse(await request.json());
					if (batch.length > 0) {
						batches.push(batch);
					}
					return new Response();
				},
			},
			modules: true,
			script: `export default {
      async fetch(request, env, ctx) {
				await env.QUEUE.send(await request.text());
        return new Response(null, { status: 204 });
      },

      async queue(batch, env, ctx) {
        await env.REPORTER.fetch("http://localhost", {
          method: "POST",
		  		body: JSON.stringify(batch.messages.map(({ id }) => id)),
        });
				batch.retryAll()
      },
    };`,
		});

		object = await getControlStub(mf, "QUEUE");
	});

	afterEach(() => mf.dispose());

	test("respects retry delays", async () => {
		await mf.dispatchFetch("http://localhost/send", {
			method: "POST",
			body: "some-message",
		});

		// Message should be delivered once
		await object.advanceFakeTime(1000);
		await object.waitForFakeTasks();
		expect(batches.length).toBe(1);

		// Message should not be re-delivered one second later
		await object.advanceFakeTime(1000);
		await object.waitForFakeTasks();
		expect(batches.length).toBe(1);

		// Message should be re-delivered once 5 seconds later
		await object.advanceFakeTime(5000);
		await object.waitForFakeTasks();
		expect(batches.length).toBe(2);

		// Message should be re-delivered once 5 seconds later
		await object.advanceFakeTime(5000);
		await object.waitForFakeTasks();
		expect(batches.length).toBe(3);
	});

	test("respects max retries", async () => {
		await mf.dispatchFetch("http://localhost/send", {
			method: "POST",
			body: "some-message",
		});

		// Message should be delivered once
		await object.advanceFakeTime(1000);
		await object.waitForFakeTasks();

		// Message should not be re-delivered one second later
		await object.advanceFakeTime(1000);
		await object.waitForFakeTasks();

		// Message should be re-delivered once 5 seconds later
		await object.advanceFakeTime(5000);
		await object.waitForFakeTasks();

		// Message should not be delivered again 5 seconds later (max retries is 2)
		await object.advanceFakeTime(5000);
		await object.waitForFakeTasks();
		expect(batches.length).toBe(3);
	});
});
