import test from "ava";
import { Miniflare, QUEUES_PLUGIN_NAME, Response } from "miniflare";
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

let batches: string[][] = [];
let mf: Miniflare;
let object: MiniflareDurableObjectControlStub;

test.beforeEach(async (t) => {
	batches = [];

	mf = new Miniflare({
		log: new TestLog(t),
		verbose: true,
		queueProducers: { QUEUE: { queueName: "QUEUE", deliveryDelay: 2 } },
		queueConsumers: {
			QUEUE: {
				maxBatchSize: 100,
				maxBatchTimeout: 0,
			},
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
				const delay = request.headers.get("X-Msg-Delay-Secs");
				const url = new URL(request.url);
				const body = await request.json();

				if (url.pathname === "/send") {
					if (delay === null) {
						await env.QUEUE.send(body);
					} else {
						await env.QUEUE.send(body, { delaySeconds: Number(delay) });
					}
				} else if (url.pathname === "/batch") {
					if (delay === null) {
						await env.QUEUE.sendBatch(body);
					} else {
						await env.QUEUE.sendBatch(body, { delaySeconds: Number(delay) });
					}
				}
        return new Response(null, { status: 204 });
      },

      async queue(batch, env, ctx) {
        delete Date.prototype.toJSON; // JSON.stringify calls .toJSON before the replacer
        await env.REPORTER.fetch("http://localhost", {
          method: "POST",
		  		body: JSON.stringify(batch.messages.map(({ id }) => id)),
        });
      },
    };`,
	});

	object = await getControlStub(mf, "QUEUE");
});

test.afterEach.always(() => mf.dispose());

test.serial(".send() respects default delay", async (t) => {
	await mf.dispatchFetch("http://localhost/send", {
		method: "POST",
		body: JSON.stringify("default"),
	});

	// Nothing should happen one second later
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	t.is(batches.length, 0);

	// A batch should be delivered 2 seconds later
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	t.is(batches.length, 1);
});

test.serial(".send() respects per-message delay", async (t) => {
	// Send 10 messages.
	for (let i = 1; i <= 10; i++) {
		await mf.dispatchFetch("http://localhost/send", {
			method: "POST",
			headers: { "X-Msg-Delay-Secs": i.toString() },
			body: JSON.stringify(i),
		});
	}

	// Verify messages are received at the right times.
	t.is(batches.length, 0);

	for (let i = 1; i <= 10; i++) {
		await object.advanceFakeTime(1000);
		await object.waitForFakeTasks();
		t.is(batches.length, i);
	}
});

test.serial(".sendBatch() respects default delay", async (t) => {
	await mf.dispatchFetch("http://localhost/batch", {
		method: "POST",
		body: JSON.stringify([{ body: "msg1" }, { body: "msg2" }]),
	});

	// Nothing should happen one second later
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	t.is(batches.length, 0);

	// Batch should be delivered 2 seconds later
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	t.is(batches.length, 2);
});

test.serial(".sendBatch() respects per-batch delay", async (t) => {
	await mf.dispatchFetch("http://localhost/batch", {
		method: "POST",
		headers: { "X-Msg-Delay-Secs": "3" },
		body: JSON.stringify([{ body: 1 }, { body: 2 }]),
	});

	// Verify messages are received at the right times.
	t.is(batches.length, 0);

	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	t.is(batches.length, 0);

	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	t.is(batches.length, 0);

	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	t.is(batches.length, 2);
});

test.serial(".sendBatch() respects per-message delay", async (t) => {
	await mf.dispatchFetch("http://localhost/batch", {
		method: "POST",
		headers: { "X-Msg-Delay-Secs": "1" },
		body: JSON.stringify([
			{ body: 10, delaySeconds: 2 },
			{ body: 11, delaySeconds: 3 },
			{ body: 12, delaySeconds: 4 },
		]),
	});

	// Verify messages are received at the right times.
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	t.is(batches.length, 0);

	for (let i = 1; i <= 3; i++) {
		await object.advanceFakeTime(1000);
		await object.waitForFakeTasks();
		t.is(batches.length, i);
	}
});
