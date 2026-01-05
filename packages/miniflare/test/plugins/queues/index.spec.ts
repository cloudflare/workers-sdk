import {
	DeferredPromise,
	LogLevel,
	Miniflare,
	MiniflareCoreError,
	QUEUES_PLUGIN_NAME,
	QueuesError,
	Response,
} from "miniflare";
import { expect, test } from "vitest";
import { z } from "zod";
import {
	LogEntry,
	MiniflareDurableObjectControlStub,
	TestLog,
	useDispose,
} from "../../test-shared";

const StringArraySchema = z.string().array();
const MessageArraySchema = z
	.object({
		queue: z.string(),
		id: z.string(),
		body: z.string(),
		attempts: z.number(),
	})
	.array();

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

test("maxBatchTimeout validation", async () => {
	const mf = new Miniflare({
		queueConsumers: {
			QUEUE: { maxBatchTimeout: 60 },
		},
		modules: true,
		script: "",
	});
	useDispose(mf);
	let error: MiniflareCoreError | undefined = undefined;
	try {
		new Miniflare({
			queueConsumers: {
				QUEUE: { maxBatchTimeout: 61 },
			},
			modules: true,
			script: "",
		});
	} catch (e) {
		error = e as MiniflareCoreError;
	}
	expect(error?.code).toEqual("ERR_VALIDATION");
	expect(error?.message).toMatch(/Number must be less than or equal to 60/);
});

test("flushes partial and full batches", async () => {
	let batches: string[][] = [];

	const mf = new Miniflare({
		workers: [
			// Check with producer and consumer as separate Workers
			{
				name: "producer",
				queueProducers: ["QUEUE"],
				modules: true,
				script: `export default {
          async fetch(request, env, ctx) {
            const url = new URL(request.url);
            const body = await request.json();
            if (url.pathname === "/send") {
              await env.QUEUE.send(body);
            } else if (url.pathname === "/batch") {
              await env.QUEUE.sendBatch(body);
            }
            return new Response(null, { status: 204 });
          }
        }`,
			},
			{
				name: "consumer",
				queueConsumers: ["QUEUE"],
				serviceBindings: {
					async REPORTER(request) {
						batches.push(StringArraySchema.parse(await request.json()));
						return new Response();
					},
				},
				modules: true,
				script: `export default {
          async queue(batch, env, ctx) {
            await env.REPORTER.fetch("http://localhost", {
              method: "POST",
              body: JSON.stringify(batch.messages.map(({ id }) => id)),
            });
          }
        }`,
			},
		],
	});
	useDispose(mf);

	async function send(message: unknown) {
		await mf.dispatchFetch("http://localhost/send", {
			method: "POST",
			body: JSON.stringify(message),
		});
	}
	async function sendBatch(...messages: unknown[]) {
		await mf.dispatchFetch("http://localhost/batch", {
			method: "POST",
			body: JSON.stringify(messages.map((body) => ({ body }))),
		});
	}

	const object = await getControlStub(mf, "QUEUE");

	// Check with single msg
	await send("msg1");
	await object.advanceFakeTime(500);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(0);
	await object.advanceFakeTime(500);
	await object.waitForFakeTasks();
	expect(batches[0]?.length).toBe(1);
	expect(batches[0][0]).toMatch(/^[0-9a-f]{32}$/);
	batches = [];

	// Check with single batch
	await sendBatch("msg1", "msg2");
	await object.advanceFakeTime(250);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(0);
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	expect(batches[0]?.length).toBe(2);
	expect(batches[0][0]).toMatch(/^[0-9a-f]{32}$/);
	expect(batches[0][1]).toMatch(/^[0-9a-f]{32}$/);
	batches = [];

	// Check with messages and batches
	await send("msg1");
	await sendBatch("msg2", "msg3");
	await send("msg4");
	await object.advanceFakeTime(100);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(0);
	await object.advanceFakeTime(900);
	await object.waitForFakeTasks();
	expect(batches[0]?.length).toBe(4);
	batches = [];

	// Check with full batch
	await sendBatch("msg1", "msg2", "msg3", "msg4", "msg5");
	await object.waitForFakeTasks();
	expect(batches.length).toBe(1);
	expect(batches[0]?.length).toBe(5);
	batches = [];

	// Check with overflowing batch
	await sendBatch("msg1", "msg2", "msg3", "msg4", "msg5", "msg6", "msg7");
	await object.waitForFakeTasks();
	expect(batches.length).toBe(1);
	// (second batch isn't full, so need to wait for max batch timeout)
	await object.advanceFakeTime(500);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(1);
	await object.advanceFakeTime(500);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(2);
	expect(batches[0]?.length).toBe(5);
	expect(batches[1]?.length).toBe(2);
	batches = [];

	// Check with overflowing batch twice
	await sendBatch("msg1", "msg2", "msg3", "msg4", "msg5", "msg6");
	await object.waitForFakeTasks();
	expect(batches.length).toBe(1);
	// (second batch isn't full yet, but sending more messages will fill it)
	await sendBatch("msg7", "msg8", "msg9", "msg10", "msg11");
	await object.waitForFakeTasks();
	expect(batches.length).toBe(2);
	// (third batch isn't full, so need to wait for max batch timeout)
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(3);
	expect(batches[0]?.length).toBe(5);
	expect(batches[1]?.length).toBe(5);
	expect(batches[2]?.length).toBe(1);
	batches = [];
});

test("supports declaring queue producers as a key-value pair -> queueProducers: { 'MY_QUEUE_BINDING': 'my-queue_name' }", async () => {
	const promise = new DeferredPromise<z.infer<typeof MessageArraySchema>>();
	const mf = new Miniflare({
		queueProducers: { MY_QUEUE_PRODUCER: "MY_QUEUE" },
		queueConsumers: ["MY_QUEUE"],
		serviceBindings: {
			async REPORTER(request) {
				promise.resolve(MessageArraySchema.parse(await request.json()));
				return new Response();
			},
		},
		modules: true,
		script: `export default {
      async fetch(request, env, ctx) {
				await env.MY_QUEUE_PRODUCER.send("Hello world!");
				await env.MY_QUEUE_PRODUCER.sendBatch([{ body: "Hola mundo!" }]);
        return new Response(null, { status: 204 });
      },
      async queue(batch, env, ctx) {
        await env.REPORTER.fetch("http://localhost", {
          method: "POST",
          body: JSON.stringify(batch.messages.map(({ id, body, attempts }) => ({ queue: batch.queue, id, body, attempts }))),
        });
      }
    }`,
	});
	useDispose(mf);
	const object = await getControlStub(mf, "MY_QUEUE");

	await mf.dispatchFetch("http://localhost");
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	const batch = await promise;
	expect(batch).toEqual([
		{ queue: "MY_QUEUE", id: batch[0].id, body: "Hello world!", attempts: 1 },
		{ queue: "MY_QUEUE", id: batch[1].id, body: "Hola mundo!", attempts: 1 },
	]);
});

test("supports declaring queue producers as an array -> queueProducers: ['MY_QUEUE_BINDING']", async () => {
	const promise = new DeferredPromise<z.infer<typeof MessageArraySchema>>();
	const mf = new Miniflare({
		queueProducers: ["MY_QUEUE"],
		queueConsumers: ["MY_QUEUE"],
		serviceBindings: {
			async REPORTER(request) {
				promise.resolve(MessageArraySchema.parse(await request.json()));
				return new Response();
			},
		},
		modules: true,
		script: `export default {
      async fetch(request, env, ctx) {
        await env.MY_QUEUE.send("Hello World!");
				await env.MY_QUEUE.sendBatch([{ body: "Hola Mundo!" }]);
        return new Response(null, { status: 204 });
      },
      async queue(batch, env, ctx) {
        await env.REPORTER.fetch("http://localhost", {
          method: "POST",
          body: JSON.stringify(batch.messages.map(({ id, body, attempts }) => ({ queue: batch.queue, id, body, attempts }))),
        });
      }
    }`,
	});
	useDispose(mf);
	const object = await getControlStub(mf, "MY_QUEUE");

	await mf.dispatchFetch("http://localhost");
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	const batch = await promise;
	expect(batch).toEqual([
		{ queue: "MY_QUEUE", id: batch[0].id, body: "Hello World!", attempts: 1 },
		{ queue: "MY_QUEUE", id: batch[1].id, body: "Hola Mundo!", attempts: 1 },
	]);
});

test("supports declaring queue producers as {MY_QUEUE_BINDING: {queueName: 'my-queue-name'}}", async () => {
	const promise = new DeferredPromise<z.infer<typeof MessageArraySchema>>();
	const mf = new Miniflare({
		queueProducers: { MY_QUEUE_PRODUCER: { queueName: "MY_QUEUE" } },
		queueConsumers: ["MY_QUEUE"],
		serviceBindings: {
			async REPORTER(request) {
				promise.resolve(MessageArraySchema.parse(await request.json()));
				return new Response();
			},
		},
		modules: true,
		script: `export default {
      async fetch(request, env, ctx) {
        await env.MY_QUEUE_PRODUCER.send("Hello World!");
				await env.MY_QUEUE_PRODUCER.sendBatch([{ body: "Hola Mundo!" }]);
        return new Response(null, { status: 204 });
      },
      async queue(batch, env, ctx) {
        await env.REPORTER.fetch("http://localhost", {
          method: "POST",
          body: JSON.stringify(batch.messages.map(({ id, body, attempts }) => ({ queue: batch.queue, id, body, attempts }))),
        });
      }
    }`,
	});
	useDispose(mf);
	const object = await getControlStub(mf, "MY_QUEUE");

	await mf.dispatchFetch("http://localhost");
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	const batch = await promise;
	expect(batch).toEqual([
		{ queue: "MY_QUEUE", id: batch[0].id, body: "Hello World!", attempts: 1 },
		{ queue: "MY_QUEUE", id: batch[1].id, body: "Hola Mundo!", attempts: 1 },
	]);
});

test("sends all structured cloneable types", async () => {
	const errorPromise = new DeferredPromise<string>();

	const mf = new Miniflare({
		queueProducers: ["QUEUE"],
		queueConsumers: {
			QUEUE: { maxBatchSize: 100, maxBatchTimeout: 0, maxRetries: 0 },
		},
		serviceBindings: {
			async REPORTER(request) {
				errorPromise.resolve(await request.text());
				return new Response();
			},
		},

		compatibilityFlags: ["nodejs_compat"],
		modules: [
			{
				// Check with producer and consumer as same Worker
				// TODO(soon): can't use `script: "..."` here as Miniflare doesn't know
				//  to ignore `node:*` imports
				type: "ESModule",
				path: "<script>",
				contents: `
        import assert from "node:assert";

        const arrayBuffer = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]).buffer;
        const cyclic = { a: 1 };
        cyclic.b = cyclic;

        const VALUES = {
          Object: { w: 1, x: 42n, y: true, z: "string" },
          Cyclic: cyclic,
          Array: [0, 1, [2, 3]],
          Date: new Date(1000),
          Map: new Map([["a", 1], ["b", 2], ["c", 3]]),
          Set: new Set(["a", "b", "c"]),
          RegExp: /ab?c/g,
          ArrayBuffer: arrayBuffer,
          DataView: new DataView(arrayBuffer, 2, 3),
          Int8Array: new Int8Array(arrayBuffer),
          Uint8Array: new Uint8Array(arrayBuffer, 1, 4),
          Uint8ClampedArray: new Uint8ClampedArray(arrayBuffer),
          Int16Array: new Int16Array(arrayBuffer),
          Uint16Array: new Uint16Array(arrayBuffer),
          Int32Array: new Int32Array(arrayBuffer),
          Uint32Array: new Uint32Array(arrayBuffer),
          Float32Array: new Float32Array(arrayBuffer),
          Float64Array: new Float64Array(arrayBuffer),
          BigInt64Array: new BigInt64Array(arrayBuffer),
          BigUint64Array: new BigUint64Array(arrayBuffer),
          Error: new Error("message", { cause: new Error("cause") }),
          EvalError: new EvalError("message"),
          RangeError: new RangeError("message"),
          ReferenceError: new ReferenceError("message"),
          SyntaxError: new SyntaxError("message"),
          TypeError: new TypeError("message"),
          URIError: new URIError("message"),
        };
        const EXTRA_CHECKS = {
          Cyclic(value) {
            assert(value.b === value, "Cyclic: cycle");
          },
          Error(value) {
            assert.deepStrictEqual(value.cause, VALUES.Error.cause, "Error: cause");
          }
        };

        export default {
          async fetch(request, env, ctx) {
            await env.QUEUE.sendBatch(Object.entries(VALUES).map(
              ([key, value]) => ({ body: { name: key, value } })
            ));
            return new Response(null, { status: 204 });
          },
          async queue(batch, env, ctx) {
            let error;
            try {
              for (const message of batch.messages) {
                const { name, value } = message.body;
                assert.deepStrictEqual(value, VALUES[name], name);
                EXTRA_CHECKS[name]?.(value);
              }
            } catch (e) {
              error = e?.stack ?? e;
            }
            await env.REPORTER.fetch("http://localhost", {
              method: "POST",
              body: String(error),
            });
          }
        }
        `,
			},
		],
	});
	useDispose(mf);
	const object = await getControlStub(mf, "QUEUE");

	await mf.dispatchFetch("http://localhost");
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	expect(await errorPromise).toBe("undefined");
});

function stripTimings(entries: LogEntry[]) {
	return entries.filter((entry) => {
		// Replace all request/queue dispatch log timings with X
		entry[1] = entry[1].replace(/\(\d+ms\)/g, "(Xms)");
		// Remove all regular fetch requests logs, these are `ctx.waitUntil()`ed,
		// so are delivered non-deterministically
		const isRequestLog =
			entry[0] === LogLevel.INFO && !entry[1].startsWith("QUEUE");
		return !isRequestLog;
	});
}

test("retries messages", async () => {
	let batches: z.infer<typeof MessageArraySchema>[] = [];
	const bodiesAttempts = () =>
		batches.map((batch) =>
			batch.map(({ body, attempts }) => ({ body, attempts }))
		);

	let retryAll = false;
	let errorAll = false;
	let retryMessages: string[] = [];

	const log = new TestLog();
	const mf = new Miniflare({
		log,
		queueProducers: { QUEUE: { queueName: "queue" } },
		queueConsumers: {
			queue: { maxBatchSize: 5, maxBatchTimeout: 1, maxRetries: 2 },
		},
		serviceBindings: {
			async RETRY_FILTER(request) {
				batches.push(MessageArraySchema.parse(await request.json()));
				return Response.json({ retryAll, errorAll, retryMessages });
			},
		},

		modules: true,
		script: `export default {
      async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const body = await request.json();
        await env.QUEUE.sendBatch(body);
        return new Response(null, { status: 204 });
      },
      async queue(batch, env, ctx) {
        const res = await env.RETRY_FILTER.fetch("http://localhost", {
          method: "POST",
          body: JSON.stringify(batch.messages.map(({ id, body, attempts }) => ({ queue: batch.queue, id, body, attempts }))),
        });
        const { retryAll, errorAll, retryMessages } = await res.json();
        if (retryAll) {
          batch.retryAll();
          return;
        }
        if (errorAll) {
          throw new Error("Whoops!");
        }
        for (const message of batch.messages) {
          if (retryMessages.includes(message.body)) message.retry();
        }
      }
    }`,
	});
	useDispose(mf);

	async function sendBatch(...messages: string[]) {
		await mf.dispatchFetch("http://localhost", {
			method: "POST",
			body: JSON.stringify(messages.map((body) => ({ body }))),
		});
	}

	const object = await getControlStub(mf, "queue");

	// Check with explicit single retry
	retryMessages = ["msg2"];
	await sendBatch("msg1", "msg2", "msg3");
	log.logs = [];
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(1);
	expect(stripTimings(log.logs)).toEqual([
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][1].id}" on queue "queue"...`,
		],
		[LogLevel.INFO, "QUEUE queue 2/3 (Xms)"],
	]);
	log.logs = [];
	retryMessages = [];
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(2);
	expect(stripTimings(log.logs)).toEqual([
		[LogLevel.INFO, "QUEUE queue 1/1 (Xms)"],
	]);
	log.logs = [];
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(2);
	expect(bodiesAttempts()).toEqual([
		[
			{ body: "msg1", attempts: 1 },
			{ body: "msg2", attempts: 1 },
			{ body: "msg3", attempts: 1 },
		],
		[{ body: "msg2", attempts: 2 }],
	]);
	batches = [];

	// Check with explicit retry all
	retryAll = true;
	await sendBatch("msg1", "msg2", "msg3");
	log.logs = [];
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(1);
	expect(stripTimings(log.logs)).toEqual([
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][0].id}" on queue "queue"...`,
		],
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][1].id}" on queue "queue"...`,
		],
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][2].id}" on queue "queue"...`,
		],
		[LogLevel.INFO, "QUEUE queue 0/3 (Xms)"],
	]);
	log.logs = [];
	retryAll = false;
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(2);
	expect(stripTimings(log.logs)).toEqual([
		[LogLevel.INFO, "QUEUE queue 3/3 (Xms)"],
	]);
	expect(bodiesAttempts()).toEqual([
		[
			{ body: "msg1", attempts: 1 },
			{ body: "msg2", attempts: 1 },
			{ body: "msg3", attempts: 1 },
		],
		[
			{ body: "msg1", attempts: 2 },
			{ body: "msg2", attempts: 2 },
			{ body: "msg3", attempts: 2 },
		],
	]);
	batches = [];

	// Check with implicit retry from exception
	errorAll = true;
	await sendBatch("msg1", "msg2", "msg3");
	log.logs = [];
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(1);
	expect(stripTimings(log.logs)).toEqual([
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][0].id}" on queue "queue"...`,
		],
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][1].id}" on queue "queue"...`,
		],
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][2].id}" on queue "queue"...`,
		],
		[LogLevel.INFO, "QUEUE queue 0/3 (Xms)"],
	]);
	log.logs = [];
	errorAll = false;
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(2);
	expect(stripTimings(log.logs)).toEqual([
		[LogLevel.INFO, "QUEUE queue 3/3 (Xms)"],
	]);
	expect(bodiesAttempts()).toEqual([
		[
			{ body: "msg1", attempts: 1 },
			{ body: "msg2", attempts: 1 },
			{ body: "msg3", attempts: 1 },
		],
		[
			{ body: "msg1", attempts: 2 },
			{ body: "msg2", attempts: 2 },
			{ body: "msg3", attempts: 2 },
		],
	]);
	batches = [];

	// Check drops messages after max retries
	retryAll = true;
	await sendBatch("msg1", "msg2", "msg3");
	log.logs = [];
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(1);
	expect(stripTimings(log.logs)).toEqual([
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][0].id}" on queue "queue"...`,
		],
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][1].id}" on queue "queue"...`,
		],
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][2].id}" on queue "queue"...`,
		],
		[LogLevel.INFO, "QUEUE queue 0/3 (Xms)"],
	]);
	log.logs = [];
	retryAll = false;
	retryMessages = ["msg3"];
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(2);
	expect(stripTimings(log.logs)).toEqual([
		[
			LogLevel.DEBUG,
			`Retrying message "${batches[0][2].id}" on queue "queue"...`,
		],
		[LogLevel.INFO, "QUEUE queue 2/3 (Xms)"],
	]);
	log.logs = [];
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(3);
	expect(stripTimings(log.logs)).toEqual([
		[
			LogLevel.WARN,
			`Dropped message "${batches[0][2].id}" on queue "queue" after 3 failed attempts!`,
		],
		[LogLevel.INFO, "QUEUE queue 0/1 (Xms)"],
	]);
	log.logs = [];
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	expect(batches.length).toBe(3);
	expect(bodiesAttempts()).toEqual([
		[
			{ body: "msg1", attempts: 1 },
			{ body: "msg2", attempts: 1 },
			{ body: "msg3", attempts: 1 },
		],
		[
			{ body: "msg1", attempts: 2 },
			{ body: "msg2", attempts: 2 },
			{ body: "msg3", attempts: 2 },
		],
		[{ body: "msg3", attempts: 3 }],
	]);
	batches = [];
});

test("moves to dead letter queue", async () => {
	const batches: z.infer<typeof MessageArraySchema>[] = [];
	let retryMessages: string[] = [];

	const log = new TestLog();
	const mf = new Miniflare({
		log,

		queueProducers: { BAD_QUEUE: { queueName: "bad" } },
		queueConsumers: {
			// Check single Worker consuming multiple queues
			bad: {
				maxBatchSize: 5,
				maxBatchTimeout: 1,
				maxRetries: 0,
				deadLetterQueue: "dlq",
			},
			dlq: {
				maxBatchSize: 5,
				maxBatchTimeout: 1,
				maxRetries: 0,
				deadLetterQueue: "bad", // (cyclic)
			},
		},
		serviceBindings: {
			async RETRY_FILTER(request) {
				batches.push(MessageArraySchema.parse(await request.json()));
				return Response.json({ retryMessages });
			},
		},

		modules: true,
		script: `export default {
      async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const body = await request.json();
        await env.BAD_QUEUE.sendBatch(body);
        return new Response(null, { status: 204 });
      },
      async queue(batch, env, ctx) {
        const res = await env.RETRY_FILTER.fetch("http://localhost", {
          method: "POST",
          body: JSON.stringify(batch.messages.map(({ id, body, attempts }) => ({ queue: batch.queue, id, body, attempts }))),
        });
        const { retryMessages } = await res.json();
        for (const message of batch.messages) {
          if (retryMessages.includes(message.body)) message.retry();
        }
      }
    }`,
	});
	useDispose(mf);

	async function sendBatch(...messages: string[]) {
		await mf.dispatchFetch("http://localhost", {
			method: "POST",
			body: JSON.stringify(messages.map((body) => ({ body }))),
		});
	}

	const badObject = await getControlStub(mf, "bad");
	const dlqObject = await getControlStub(mf, "dlq");

	// Check moves messages to dead letter queue after max retries
	retryMessages = ["msg2", "msg3"];
	await sendBatch("msg1", "msg2", "msg3");
	log.logs = [];
	await badObject.advanceFakeTime(1000);
	await badObject.waitForFakeTasks();
	expect(batches.length).toBe(1);
	expect(stripTimings(log.logs)).toEqual([
		[
			LogLevel.WARN,
			`Moving message "${batches[0][1].id}" on queue "bad" to dead letter queue "dlq" after 1 failed attempt...`,
		],
		[
			LogLevel.WARN,
			`Moving message "${batches[0][2].id}" on queue "bad" to dead letter queue "dlq" after 1 failed attempt...`,
		],
		[LogLevel.INFO, "QUEUE bad 1/3 (Xms)"],
	]);
	log.logs = [];
	// Check allows cyclic dead letter queue path with multiple queues
	retryMessages = ["msg2"];
	await dlqObject.advanceFakeTime(1000);
	await dlqObject.waitForFakeTasks();
	expect(batches.length).toBe(2);
	expect(stripTimings(log.logs)).toEqual([
		[
			LogLevel.WARN,
			`Moving message "${batches[0][1].id}" on queue "dlq" to dead letter queue "bad" after 1 failed attempt...`,
		],
		[LogLevel.INFO, "QUEUE dlq 1/2 (Xms)"],
	]);
	log.logs = [];
	retryMessages = [];
	await badObject.advanceFakeTime(1000);
	await badObject.waitForFakeTasks();
	expect(batches.length).toBe(3);
	expect(stripTimings(log.logs)).toEqual([
		[LogLevel.INFO, "QUEUE bad 1/1 (Xms)"],
	]);
	log.logs = [];
	expect(batches).toEqual([
		[
			{ queue: "bad", id: batches[0][0].id, body: "msg1", attempts: 1 },
			{ queue: "bad", id: batches[0][1].id, body: "msg2", attempts: 1 },
			{ queue: "bad", id: batches[0][2].id, body: "msg3", attempts: 1 },
		],
		[
			{ queue: "dlq", id: batches[0][1].id, body: "msg2", attempts: 1 },
			{ queue: "dlq", id: batches[0][2].id, body: "msg3", attempts: 1 },
		],
		[{ queue: "bad", id: batches[0][1].id, body: "msg2", attempts: 1 }],
	]);

	// Check rejects queue as own dead letter queue
	const promise = mf.setOptions({
		log,
		queueConsumers: { bad: { deadLetterQueue: "bad" } },
		script: "",
	});
	await expect(promise).rejects.toThrow(
		new QueuesError(
			"ERR_DEAD_LETTER_QUEUE_CYCLE",
			`Dead letter queue for queue "bad" cannot be itself`
		)
	);
});

test("operations permit strange queue names", async () => {
	const promise = new DeferredPromise<z.infer<typeof MessageArraySchema>>();
	const id = "my/ Queue";
	const mf = new Miniflare({
		queueProducers: { QUEUE: { queueName: id } },
		queueConsumers: [id],
		serviceBindings: {
			async REPORTER(request) {
				promise.resolve(MessageArraySchema.parse(await request.json()));
				return new Response();
			},
		},
		modules: true,
		script: `export default {
      async fetch(request, env, ctx) {
        await env.QUEUE.send("msg1");
        await env.QUEUE.sendBatch([{ body: "msg2" }]);
        return new Response(null, { status: 204 });
      },
      async queue(batch, env, ctx) {
        await env.REPORTER.fetch("http://localhost", {
          method: "POST",
          body: JSON.stringify(batch.messages.map(({ id, body, attempts }) => ({ queue: batch.queue, id, body, attempts }))),
        });
      }
    }`,
	});
	useDispose(mf);
	const object = await getControlStub(mf, id);

	await mf.dispatchFetch("http://localhost");
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	const batch = await promise;
	expect(batch).toEqual([
		{ queue: id, id: batch[0].id, body: "msg1", attempts: 1 },
		{ queue: id, id: batch[1].id, body: "msg2", attempts: 1 },
	]);
});

test("supports message contentTypes", async () => {
	const MessageContentTypeTestSchema = z
		.object({ queue: z.string(), id: z.string(), body: z.any() })
		.array();
	const promise = new DeferredPromise<
		z.infer<typeof MessageContentTypeTestSchema>
	>();
	const id = "my/ Queue";
	const log = new TestLog();
	const mf = new Miniflare({
		log,
		queueProducers: { QUEUE: { queueName: id } },
		queueConsumers: [id],
		serviceBindings: {
			async REPORTER(request) {
				promise.resolve(
					MessageContentTypeTestSchema.parse(await request.json())
				);
				return new Response();
			},
		},
		modules: true,
		script: `export default {
      async fetch(request, env, ctx) {
        await env.QUEUE.send("msg1", { contentType: "text" });
        await env.QUEUE.send([{ message: "msg2" }], { contentType: "json" });
        const arrayBuffer = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
        await env.QUEUE.send(arrayBuffer, { contentType: "bytes" });
        await env.QUEUE.send(new Date(1600000000000), { contentType: "v8" });
        return new Response();
      },
      async queue(batch, env, ctx) {
        delete Date.prototype.toJSON; // JSON.stringify calls .toJSON before the replacer
        await env.REPORTER.fetch("http://localhost", {
          method: "POST",
          body: JSON.stringify(
            batch.messages.map(({ id, body }) => ({
              queue: batch.queue,
              id,
              body,
            })),
            (_, value) => {
              if (value instanceof ArrayBuffer) {
                return {
                  $type: "ArrayBuffer",
                  value: Array.from(new Uint8Array(value)),
                };
              } else if (value instanceof Date) {
                return { $type: "Date", value: value.getTime() };
              }
              return value;
            },
          ),
        });
      },
    };`,
	});
	useDispose(mf);
	const object = await getControlStub(mf, id);

	const res = await mf.dispatchFetch("http://localhost");
	await res.arrayBuffer();
	await object.advanceFakeTime(1000);
	await object.waitForFakeTasks();
	const batch = await promise;
	expect(batch).toEqual([
		{ queue: id, id: batch[0].id, body: "msg1" },
		{ queue: id, id: batch[1].id, body: [{ message: "msg2" }] },
		{
			queue: id,
			id: batch[2].id,
			body: { $type: "ArrayBuffer", value: [0, 1, 2, 3, 4, 5, 6, 7] },
		},
		{
			queue: id,
			id: batch[3].id,
			body: { $type: "Date", value: 1600000000000 },
		},
	]);
});

test("validates message size", async () => {
	const mf = new Miniflare({
		queueProducers: { QUEUE: "MY_QUEUE" },
		queueConsumers: {
			MY_QUEUE: {
				maxBatchSize: 100,
				maxBatchTimeout: 0,
			},
		},
		modules: true,
		script: `export default {
      async fetch(request, env, ctx) {
        const { pathname } = new URL(request.url);
        try {
          await env.QUEUE.send(new Uint8Array(128 * 1000 + 1), { contentType: "bytes" });
          return new Response(null, { status: 204 });
        } catch (e) {
          const error = {
            name: e?.name,
            message: e?.message ?? String(e),
            stack: e?.stack,
          };
          return Response.json(error, {
            status: 500,
            headers: { "MF-Experimental-Error-Stack": "true" },
          });
        }
      },
    }`,
	});
	useDispose(mf);

	await expect(mf.dispatchFetch("http://localhost")).rejects.toThrow(
		"Queue send failed: message length of 128001 bytes exceeds limit of 128000"
	);
});
